import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import { CompanyShell } from "./company-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const companyRows = await sql<Array<Record<string, unknown>>>`
    select * from public.company where id = ${id}
  `;
  const company = companyRows[0];
  if (!company) return notFound();

  const [contacts, activity, sends, tasks, agentRuns] = await Promise.all([
    // Contacts for this company — pulled from v_contact so email rollups + company columns come along.
    sql<Array<Record<string, unknown>>>`
      select id, first_name, last_name, full_name, email, phone, job_title,
             linkedin_url, twitter_username, key_contact, lead_status,
             emails_delivered, emails_opened, emails_clicked, emails_replied,
             unsubscribed_all_email, last_activity_date
      from public.v_contact
      where company_id = ${id}
      order by emails_opened desc nulls last
      limit 500
    `,
    // Activity log — canonical table is `activity` (singular), meta lives under `raw`.
    sql<Array<Record<string, unknown>>>`
      select id, kind, subject, body, occurred_at, owner as actor, source_system as source, raw as meta
      from public.activity
      where company_id = ${id}
      order by occurred_at desc
      limit 200
    `,
    // Campaign sends across every contact at this company.
    sql<Array<Record<string, unknown>>>`
      select cs.id, cs.contact_id, cs.subject, cs.status, cs.sent_at, cs.opens, cs.clicks
      from public.campaign_send cs
      where cs.contact_id in (
        select id from public.contact where company_id = ${id}
      )
      order by cs.sent_at desc nulls last
      limit 100
    `,
    sql<Array<Record<string, unknown>>>`
      select id, title, body as detail, status, due_at, assigned_to, origin, meta, created_at, updated_at
      from public.task
      where company_id = ${id}
      order by created_at desc
      limit 50
    `,
    // agent_run has canonical column names: agent_name, entity_table, entity_id, completed_at.
    // We alias back to the shape the UI expects.
    sql<Array<Record<string, unknown>>>`
      select id,
             agent_name  as kind,
             entity_table as target_type,
             entity_id   as target_id,
             model, status, input, output, error, started_at,
             completed_at as finished_at
      from public.agent_run
      where entity_table = 'company' and entity_id = ${id}
      order by started_at desc
      limit 20
    `,
  ]);

  // Peer companies — match by summit_interest overlap OR industry / macro / subcategory.
  const summitInterest = (company.summit_interest as string[] | null) ?? [];
  const industry = (company.industry as string | null) ?? null;
  const macroCategory = (company.macro_category as string | null) ?? null;
  const subcategory = (company.subcategory as string | null) ?? null;

  const peersRaw = await sql<Array<Record<string, unknown>>>`
    select id, name, domain, sponsor_tier, industry, macro_category, subcategory,
           summit_interest, is_customer, keep
    from public.company
    where id <> ${id}
      and (
        ${industry ? sql`industry = ${industry}` : sql`false`}
        or ${macroCategory ? sql`macro_category = ${macroCategory}` : sql`false`}
        or ${subcategory ? sql`subcategory = ${subcategory}` : sql`false`}
        or ${
          summitInterest.length > 0
            ? sql`summit_interest && ${summitInterest}::text[]`
            : sql`false`
        }
      )
    limit 120
  `;

  // Annotate with overlap reasons.
  const peers = peersRaw
    .map((p) => {
      const overlap: string[] = [];
      if (industry && p.industry === industry) overlap.push("industry");
      if (macroCategory && p.macro_category === macroCategory) overlap.push("macro category");
      if (subcategory && p.subcategory === subcategory) overlap.push("subcategory");
      const pSummit = (p.summit_interest as string[] | null) ?? [];
      for (const t of summitInterest) {
        if (pSummit.includes(t)) overlap.push(`summit:${t}`);
      }
      return { ...p, overlap };
    })
    .slice(0, 60);

  return (
    <CompanyShell
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company={company as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contacts={contacts as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activity={activity as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sends={sends as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tasks={tasks as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agentRuns={agentRuns as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      peers={peers as any}
    />
  );
}
