// POST /api/agents/research  { company_id }
// Runs a Perplexity-driven company research pass and saves it to
// public.enrichment + public.agent_run. Requires PERPLEXITY_API_KEY
// (optional — falls back to a stub result when missing).
//
// Canonical singular schema:
//   agent_run: agent_name, entity_table, entity_id, status, input, output,
//              started_at, completed_at, error
//   enrichment: entity_table, entity_id, source, payload, cost_usd, occurred_at

import { NextRequest, NextResponse } from "next/server";
import { sql, single, dbError } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  macro_category: string | null;
  group: string | null;
  subcategory: string | null;
  summit_interest: string[] | null;
  sponsor_tier: string | null;
};

type ResearchOutput = {
  summary?: string;
  stubbed?: boolean;
  raw?: string;
  citations?: unknown;
  [k: string]: unknown;
};

export async function POST(req: NextRequest) {
  let body: { company_id?: string } = {};
  try { body = await req.json(); } catch {}
  if (!body.company_id) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  let company: CompanyRow;
  let run: { id: string };

  try {
    const companyRows = await sql<CompanyRow[]>`
      select id, name, domain, macro_category, "group", subcategory,
             summit_interest, sponsor_tier
        from public.company
       where id = ${body.company_id}
       limit 1
    `;
    company = single<CompanyRow>(companyRows);
  } catch {
    return NextResponse.json({ error: "company not found" }, { status: 404 });
  }

  try {
    const started = new Date().toISOString();
    const input = { company_id: company.id, name: company.name, domain: company.domain };
    const runRows = await sql<{ id: string }[]>`
      insert into public.agent_run
        (agent_name, entity_table, entity_id, status, input, started_at)
      values
        ('enrich_company',
         'company',
         ${company.id},
         'running',
         ${sql.json(input as unknown as Parameters<typeof sql.json>[0])},
         ${started})
      returning id
    `;
    run = single<{ id: string }>(runRows);
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const pplxKey = process.env.PERPLEXITY_API_KEY;
  let output: ResearchOutput;
  try {
    if (!pplxKey) {
      output = {
        summary: `Stub research for ${company.name} — set PERPLEXITY_API_KEY to enable live agent research.`,
        stubbed: true,
      };
    } else {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${pplxKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "system",
              content:
                "You are a B2B sponsor-prospecting research assistant. Return a compact JSON object: { summary, recent_news[], products[], sponsorship_signals[], likely_budget, decision_makers[], next_moves[] }.",
            },
            {
              role: "user",
              content:
                `Company: ${company.name}${company.domain ? ` (${company.domain})` : ""}. ` +
                `Research their fit as a sponsor for an enterprise IT summit series. ` +
                `Current category: ${company.macro_category || "unknown"} · ${company.group || ""}. ` +
                `Summit interests on file: ${(company.summit_interest || []).join(", ") || "none"}.`,
            },
          ],
        }),
      });
      const j = await res.json();
      output = j?.choices?.[0]?.message?.content
        ? { raw: j.choices[0].message.content, citations: j.citations }
        : j;
    }

    // Log the enrichment. On canonical `enrichment` uses (entity_table, entity_id).
    await sql`
      insert into public.enrichment
        (entity_table, entity_id, source, payload)
      values
        ('company',
         ${company.id},
         'perplexity',
         ${sql.json(output as unknown as Parameters<typeof sql.json>[0])})
    `;

    await sql`
      update public.agent_run
         set status       = 'done',
             output       = ${sql.json(output as unknown as Parameters<typeof sql.json>[0])},
             completed_at = now()
       where id = ${run.id}
    `;

    return NextResponse.json({ run_id: run.id, output });
  } catch (e) {
    const err = dbError(e);
    await sql`
      update public.agent_run
         set status       = 'error',
             error        = ${err.message},
             completed_at = now()
       where id = ${run.id}
    `;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
