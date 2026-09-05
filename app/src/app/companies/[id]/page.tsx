import { admin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { CompanyShell } from "./company-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const { data: company } = await db
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!company) return notFound();

  // First get contact IDs so we can filter sends
  const { data: contactIdList } = await db
    .from("contacts")
    .select("id")
    .eq("company_id", id)
    .limit(500);
  const contactIds = contactIdList?.map((c: any) => c.id) || [];

  const [
    { data: contacts },
    { data: activity },
    { data: sends },
    { data: tasks },
    { data: agentRuns },
  ] = await Promise.all([
    db
      .from("contacts")
      .select(
        "id, first_name, last_name, full_name, email, phone, job_title, linkedin_url, twitter_username, key_contact, lead_status, emails_delivered, emails_opened, emails_clicked, emails_replied, unsubscribed_all_email, last_activity_date"
      )
      .eq("company_id", id)
      .order("emails_opened", { ascending: false, nullsFirst: false })
      .limit(500),
    db
      .from("activities")
      .select("id, kind, subject, body, occurred_at, actor, source, meta")
      .eq("company_id", id)
      .order("occurred_at", { ascending: false })
      .limit(200),
    db
      .from("campaign_sends")
      .select("id, contact_id, subject, status, sent_at, opens, clicks")
      .in("contact_id", contactIds)
      .order("sent_at", { ascending: false })
      .limit(100),
    db
      .from("tasks")
      .select("id, title, detail, status, due_at, assigned_to, origin, meta, created_at, updated_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("agent_runs")
      .select("id, kind, target_type, target_id, model, status, input, output, error, started_at, finished_at")
      .eq("target_type", "company")
      .eq("target_id", id)
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  // Peer company query for Connections panel
  // Match by summit_interest overlap OR industry OR macro_category / subcategory
  const summitInterest: string[] = company.summit_interest || [];
  const orClauses: string[] = [];
  if (company.industry) orClauses.push(`industry.eq.${escapeOr(company.industry)}`);
  if (company.macro_category) orClauses.push(`macro_category.eq.${escapeOr(company.macro_category)}`);
  if (company.subcategory) orClauses.push(`subcategory.eq.${escapeOr(company.subcategory)}`);
  // summit_interest is text[] — use overlaps operator via `.or` isn't clean; do a follow-on query.

  let peersRaw: any[] = [];
  if (orClauses.length > 0) {
    const { data: cats } = await db
      .from("companies")
      .select("id, name, domain, sponsor_tier, industry, macro_category, subcategory, summit_interest, is_customer, keep")
      .or(orClauses.join(","))
      .neq("id", id)
      .limit(80);
    peersRaw = cats || [];
  }
  if (summitInterest.length > 0) {
    // Overlaps via `.overlaps` (Supabase JS)
    const { data: sPeers } = await db
      .from("companies")
      .select("id, name, domain, sponsor_tier, industry, macro_category, subcategory, summit_interest, is_customer, keep")
      .overlaps("summit_interest", summitInterest)
      .neq("id", id)
      .limit(60);
    for (const s of sPeers || []) {
      if (!peersRaw.find((p) => p.id === s.id)) peersRaw.push(s);
    }
  }

  // Annotate with overlap reasons
  const peers = peersRaw.map((p) => {
    const overlap: string[] = [];
    if (company.industry && p.industry === company.industry) overlap.push("industry");
    if (company.macro_category && p.macro_category === company.macro_category) overlap.push("macro category");
    if (company.subcategory && p.subcategory === company.subcategory) overlap.push("subcategory");
    for (const t of summitInterest) {
      if ((p.summit_interest || []).includes(t)) overlap.push(`summit:${t}`);
    }
    return { ...p, overlap };
  }).slice(0, 60);

  return (
    <CompanyShell
      company={company as any}
      contacts={(contacts as any) || []}
      activity={(activity as any) || []}
      sends={(sends as any) || []}
      tasks={(tasks as any) || []}
      agentRuns={(agentRuns as any) || []}
      peers={peers as any}
    />
  );
}

// Escape a value for use inside a Supabase `.or(...)` clause. Values with commas
// or parens must be quoted; we simply strip problematic chars and wrap.
function escapeOr(v: string): string {
  return `"${String(v).replace(/["\\]/g, "")}"`;
}
