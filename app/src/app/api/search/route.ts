// Simple global search across companies, contacts, and taxonomy nodes.
// Agent hooks will layer on top of this — the shape returned is intentionally
// generic so an agent can rerank / annotate the same rows later.
//
// Canonical singular: public.company / public.contact.

import { NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Hit = {
  kind: "company" | "contact" | "taxonomy";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  meta?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ q, hits: [] });

  const like = `%${q.replace(/[%_]/g, "")}%`;

  try {
    const [companies, contacts, taxonomy] = await Promise.all([
      sql<Array<{
        id: string; name: string; domain: string | null;
        sponsor_tier: string | null; macro_category: string | null;
      }>>`
        select id, name, domain, sponsor_tier, macro_category
          from public.company
         where name ilike ${like} or domain ilike ${like}
         order by sponsor_tier_rank asc nulls last
         limit 6
      `,
      sql<Array<{
        id: string; first_name: string | null; last_name: string | null;
        email: string | null; job_title: string | null; company_id: string | null;
      }>>`
        select id, first_name, last_name, email, job_title, company_id
          from public.contact
         where first_name ilike ${like}
            or last_name  ilike ${like}
            or email      ilike ${like}
         limit 6
      `,
      sql<Array<{
        macro_category: string | null; group: string | null;
        subcategory: string | null; company_count: number | null;
      }>>`
        select macro_category, "group", subcategory, company_count
          from public.v_taxonomy
         where macro_category ilike ${like}
            or "group"        ilike ${like}
            or subcategory    ilike ${like}
         order by company_count desc
         limit 6
      `,
    ]);

    const hits: Hit[] = [];

    for (const c of companies) {
      hits.push({
        kind: "company",
        id: String(c.id),
        title: c.name,
        subtitle: c.domain || undefined,
        href: `/companies/${c.id}`,
        meta: c.sponsor_tier || c.macro_category || undefined,
      });
    }

    for (const c of contacts) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || (c.email ?? "");
      hits.push({
        kind: "contact",
        id: String(c.id),
        title: name,
        subtitle: c.job_title || c.email || undefined,
        href: `/contacts/${c.id}`,
        meta: c.email || undefined,
      });
    }

    for (const t of taxonomy) {
      const path = [t.macro_category, t.group, t.subcategory].filter(Boolean).join(" › ");
      const query: Record<string, string> = { tab: "marketplace" };
      if (t.macro_category) query.macro = t.macro_category;
      if (t.group) query.group = t.group;
      if (t.subcategory) query.sub = t.subcategory;
      const href = `/start?${new URLSearchParams(query).toString()}`;
      hits.push({
        kind: "taxonomy",
        id: path,
        title: t.subcategory || t.group || t.macro_category || "(unknown)",
        subtitle: path,
        href,
        meta: `${t.company_count ?? 0} companies`,
      });
    }

    return NextResponse.json({ q, hits });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message, q, hits: [] }, { status: 500 });
  }
}
