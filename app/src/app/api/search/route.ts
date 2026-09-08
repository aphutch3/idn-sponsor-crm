import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple global search across companies, contacts, and taxonomy nodes.
// Agent hooks will layer on top of this — the shape returned is intentionally
// generic so an agent can rerank / annotate the same rows later.

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

  const supa = db();
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const [companies, contacts, taxonomy] = await Promise.all([
    supa
      .from("companies")
      .select("id, name, domain, sponsor_tier, macro_category")
      .or(`name.ilike.${like},domain.ilike.${like}`)
      .order("sponsor_tier_rank", { ascending: true, nullsFirst: false })
      .limit(6),
    supa
      .from("contacts")
      .select("id, first_name, last_name, email, job_title, company_id")
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
      .limit(6),
    supa
      .from("v_taxonomy")
      .select("macro_category, group, subcategory, company_count")
      .or(`macro_category.ilike.${like},group.ilike.${like},subcategory.ilike.${like}`)
      .order("company_count", { ascending: false })
      .limit(6),
  ]);

  const hits: Hit[] = [];

  for (const c of companies.data || []) {
    hits.push({
      kind: "company",
      id: String(c.id),
      title: c.name,
      subtitle: c.domain || undefined,
      href: `/companies/${c.id}`,
      meta: c.sponsor_tier || c.macro_category || undefined,
    });
  }

  for (const c of contacts.data || []) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
    hits.push({
      kind: "contact",
      id: String(c.id),
      title: name,
      subtitle: c.job_title || c.email || undefined,
      href: `/contacts/${c.id}`,
      meta: c.email || undefined,
    });
  }

  for (const t of taxonomy.data || []) {
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
      meta: `${t.company_count} companies`,
    });
  }

  return NextResponse.json({ q, hits });
}
