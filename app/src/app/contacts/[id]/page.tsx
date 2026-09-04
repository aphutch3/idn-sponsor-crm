import { admin } from "@/lib/supabase";
import { Card, PageHeader, Badge, Empty } from "@/components/ui";
import Link from "next/link";
import { fmtDate } from "@/lib/utils";
import { notFound } from "next/navigation";

export const revalidate = 30;

export default async function ContactDetail({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: c } = await db.from("contacts")
    .select("*, companies(id, name, macro_category, sponsor_tier)")
    .eq("id", params.id)
    .maybeSingle();
  if (!c) return notFound();

  const { data: activities } = await db.from("activities")
    .select("*").eq("contact_id", params.id).order("occurred_at", { ascending: false }).limit(20);

  return (
    <div className="p-8 max-w-5xl">
      <div className="text-xs text-muted mb-2">
        <Link href="/contacts" className="hover:text-fg">Contacts</Link> / {c.first_name} {c.last_name}
      </div>
      <PageHeader
        title={`${c.first_name || ""} ${c.last_name || ""}`.trim() || "(unnamed)"}
        subtitle={[c.job_title, c.companies?.name, c.country_region].filter(Boolean).join(" · ")}
        right={
          <>
            {(c.key_contact || []).map((k: string) => <Badge key={k} tone="accent">{k}</Badge>)}
            {c.lead_status && <Badge tone="muted">{c.lead_status}</Badge>}
            {c.unsubscribed_all_email && <Badge tone="danger">Unsubscribed</Badge>}
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted mb-2">Contact</div>
          <div className="text-sm space-y-1.5">
            {c.email && <div><a href={`mailto:${c.email}`} className="hover:text-accent mono">{c.email}</a></div>}
            {c.phone && <div className="mono">{c.phone}</div>}
            {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener" className="block hover:text-accent truncate">💼 LinkedIn</a>}
            {c.twitter_username && <div className="mono text-muted">@{c.twitter_username}</div>}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted mb-2">Company</div>
          {c.companies ? (
            <div className="text-sm space-y-1">
              <Link href={`/companies/${c.companies.id}`} className="font-medium hover:text-accent block">{c.companies.name}</Link>
              <div className="text-muted">{c.companies.macro_category || "—"}</div>
              {c.companies.sponsor_tier && <Badge tone="accent">{c.companies.sponsor_tier}</Badge>}
            </div>
          ) : (
            <div className="text-sm text-muted">Not linked — HubSpot company id: <span className="mono">{c.hubspot_company_id || "—"}</span></div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted mb-2">Marketing engagement</div>
          <div className="text-sm space-y-1">
            <div>Delivered: <span className="mono">{c.emails_delivered}</span></div>
            <div>Opened: <span className="mono">{c.emails_opened}</span> · Clicked: <span className="mono">{c.emails_clicked}</span></div>
            <div>Replied: <span className="mono">{c.emails_replied}</span> · Bounced: <span className="mono">{c.emails_bounced}</span></div>
            <div className="text-xs text-muted">Last send: {fmtDate(c.last_email_send_date)}</div>
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">Activity</h2>
        </div>
        {(!activities || activities.length === 0) ? (
          <Empty title="No activity yet" hint="Emails, calls, and agent actions land here." />
        ) : (
          <Card className="p-4 space-y-3">
            {activities.map((a: any) => (
              <div key={a.id} className="text-sm border-l-2 border-border pl-3">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Badge tone="muted">{a.kind}</Badge>
                  <span>{fmtDate(a.occurred_at)}</span>
                  <span>·</span>
                  <span>{a.actor || a.source}</span>
                </div>
                {a.subject && <div className="font-medium mt-1">{a.subject}</div>}
                {a.body && <div className="text-muted mt-0.5">{a.body}</div>}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
