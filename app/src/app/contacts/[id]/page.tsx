import { admin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { ContactShell } from "./contact-shell";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function ContactDetail({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: c } = await db
    .from("contacts")
    .select("*, companies(id, name, domain, macro_category, sponsor_tier)")
    .eq("id", params.id)
    .maybeSingle();

  if (!c) return notFound();

  const [{ data: activities }, { data: sends }] = await Promise.all([
    db
      .from("activities")
      .select("id, kind, subject, body, occurred_at, source, meta")
      .eq("contact_id", params.id)
      .order("occurred_at", { ascending: false })
      .limit(200),
    db
      .from("campaign_sends")
      .select("*")
      .eq("contact_id", params.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const { companies, ...contact } = c as any;

  return (
    <ContactShell
      contact={contact}
      company={companies || null}
      activity={activities || []}
      sends={sends || []}
    />
  );
}
