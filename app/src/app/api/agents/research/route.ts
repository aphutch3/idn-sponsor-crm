import { NextRequest, NextResponse } from "next/server";
import { db, dbWrite } from "@/lib/supabase";

// POST /api/agents/research  { company_id }
// Runs a Perplexity-driven company research pass and saves it to enrichments + agent_runs.
// Requires PERPLEXITY_API_KEY (optional — falls back to a stub result when missing).

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { company_id?: string } = {};
  try { body = await req.json(); } catch {}
  if (!body.company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const supa = db();
  const { data: company, error: cErr } = await supa.from("companies").select("id, name, domain, macro_category, group, subcategory, summit_interest, sponsor_tier").eq("id", body.company_id).maybeSingle();
  if (cErr || !company) return NextResponse.json({ error: "company not found" }, { status: 404 });

  let write;
  try { write = dbWrite(); } catch {
    return NextResponse.json({ error: "Writes are disabled — set SUPABASE_SERVICE_ROLE_KEY on the server to enable agent runs." }, { status: 503 });
  }

  const { data: run, error: rErr } = await write.from("agent_runs").insert({
    kind: "enrich_company",
    target_type: "company",
    target_id: company.id,
    status: "running",
    input: { company_id: company.id, name: company.name, domain: company.domain },
    started_at: new Date().toISOString(),
  }).select().single();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const pplxKey = process.env.PERPLEXITY_API_KEY;
  let output: any;
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
            { role: "system", content: "You are a B2B sponsor-prospecting research assistant. Return a compact JSON object: { summary, recent_news[], products[], sponsorship_signals[], likely_budget, decision_makers[], next_moves[] }." },
            { role: "user", content: `Company: ${company.name}${company.domain ? ` (${company.domain})` : ""}. Research their fit as a sponsor for an enterprise IT summit series. Current category: ${company.macro_category || "unknown"} · ${company.group || ""}. Summit interests on file: ${(company.summit_interest || []).join(", ") || "none"}.` },
          ],
        }),
      });
      const j = await res.json();
      output = j?.choices?.[0]?.message?.content ? { raw: j.choices[0].message.content, citations: j.citations } : j;
    }

    await write.from("enrichments").insert({
      company_id: company.id,
      source: "perplexity",
      payload: output,
      agent_run_id: run.id,
    });
    await write.from("agent_runs").update({ status: "done", output, ended_at: new Date().toISOString() }).eq("id", run.id);
    return NextResponse.json({ run_id: run.id, output });
  } catch (e: any) {
    await write.from("agent_runs").update({ status: "error", error: String(e?.message || e), ended_at: new Date().toISOString() }).eq("id", run.id);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
