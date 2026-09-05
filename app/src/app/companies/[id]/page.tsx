import { admin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { CompanyShell } from "./company-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyDetail({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: company } = await db
    .from("companies")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!company) return notFound();

  const [{ data: contacts }, { data: activity }, { data: sends }] = await Promise.all([
    db
      .from("contacts")
      .select(
        "id, first_name, last_name, full_name, email, phone, job_title, linkedin_url, twitter_username, key_contact, lead_status, emails_delivered, emails_opened, emails_clicked, emails_replied, unsubscribed_all_email, last_activity_date"
      )
      .eq("company_id", params.id)
      .order("emails_opened", { ascending: false, nullsFirst: false })
      .limit(500),
    db
      .from("activities")
      .select("id, kind, subject, body, occurred_at, actor, source, meta")
      .eq("company_id", params.id)
      .order("occurred_at", { ascending: false })
      .limit(200),
    db
      .from("campaign_sends")
      .select("id, contact_id, subject, status, sent_at, opens, clicks")
      .in(
        "contact_id",
        // Fallback path: if the contacts fetch failed, skip sends by passing empty array.
        // Supabase .in() with [] returns empty result set safely.
        (
          await db
            .from("contacts")
            .select("id")
            .eq("company_id", params.id)
            .limit(500)
        ).data?.map((c: any) => c.id) || []
      )
      .order("sent_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <CompanyShell
      company={company as any}
      contacts={(contacts as any) || []}
      activity={(activity as any) || []}
      sends={(sends as any) || []}
    />
  );
}
