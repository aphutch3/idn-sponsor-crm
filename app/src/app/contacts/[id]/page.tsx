import { sql, maybeSingle } from "@/lib/db";
import { notFound } from "next/navigation";
import { ContactShell } from "./contact-shell";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function ContactDetail({ params }: { params: { id: string } }) {
  const { id } = params;

  // Contact fetched from v_contact so email rollups + company columns come along.
  const contactRow = maybeSingle(
    await sql<Array<Record<string, unknown>>>`
      select
        c.id, c.first_name, c.last_name, c.full_name, c.email, c.phone,
        c.job_title, c.linkedin_url, c.twitter_username, c.person_id,
        c.company_id, c.owner, c.lead_status, c.email_domain,
        c.key_contact, c.emails_delivered, c.emails_opened, c.emails_clicked,
        c.emails_replied, c.last_email_open_date, c.last_email_click_date,
        c.last_email_send_date, c.last_activity_date,
        c.unsubscribed_all_email, c.unsubscribed_all,
        c.created_at, c.updated_at
      from public.contact c
      where c.id = ${id}
    `
  );
  if (!contactRow) return notFound();

  // Load company separately so we control the shape without embed magic.
  const company = contactRow.company_id
    ? maybeSingle(
        await sql<Array<Record<string, unknown>>>`
          select id, name, domain, macro_category, sponsor_tier
          from public.company
          where id = ${contactRow.company_id as string}
        `
      )
    : null;

  const [activities, sends] = await Promise.all([
    sql<Array<Record<string, unknown>>>`
      select id, kind, subject, body, occurred_at, source_system as source, raw as meta
      from public.activity
      where contact_id = ${id}
      order by occurred_at desc
      limit 200
    `,
    sql<Array<Record<string, unknown>>>`
      select id, campaign_id, contact_id, subject, status,
             sent_at, delivered_at, first_opened_at, last_opened_at,
             first_clicked_at, last_clicked_at, last_clicked_url,
             opens, clicks, bounced_at, complained_at, error,
             last_event_at, created_at
      from public.campaign_send
      where contact_id = ${id}
      order by created_at desc
      limit 100
    `,
  ]);

  return (
    <ContactShell
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contact={contactRow as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company={(company as any) || null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activity={activities as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sends={sends as any}
    />
  );
}
