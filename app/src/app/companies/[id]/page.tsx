import { admin } from "@/lib/supabase";
import { Card, PageHeader, Badge, Empty } from "@/components/ui";
import Link from "next/link";
import { fmtDate, fmtNum } from "@/lib/utils";
import { notFound } from "next/navigation";

export const revalidate = 30;

export default async function CompanyDetail({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: c } = await db.from("companies").select("*").eq("id", params.id).maybeSingle();
  if (!c) return notFound();

  const { data: contacts } = await db.from("contacts")
    .select("id, first_name, last_name, email, job_title, key_contact, lead_status, emails_opened, emails_clicked, emails_replied, unsubscribed_all_email")
    .eq("company_id", params.id)
    .order("emails_opened", { ascending: false, nullsFirst: false });

  const { data: activities } = await db.from("activities")
    .select("*").eq("company_id", params.id).order("occurred_at", { ascending: false }).limit(20);

  return (
    <div className="p-8 max-w-6xl">
      <div className="text-xs text-muted mb-2">
        <Link href="/companies" className="hover:text-fg">Companies</Link> / {c.name}
      </div>
      <PageHeader
        title={c.name}
        subtitle={[c.domain, c.macro_category, c.subcategory, c.country_region].filter(Boolean).join(" · ")}
        right={
          <>
            {c.sponsor_tier && <Badge tone="accent">{c.sponsor_tier}</Badge>}
            {c.company_type && <Badge tone="muted">{c.company_type}</Badge>}
            {c.startup && <Badge tone="warn">Startup</Badge>}
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted mb-2">Sponsor</div>
          <div className="text-sm space-y-1">
            <div><span className="text-muted">Tier: </span>{c.sponsor_tier || "—"}</div>
            <div><span className="text-muted">Rank history: </span><span className="mono">{c.rank_history || "—"}</span></div>
            <div><span className="text-muted">Owner: </span>{c.company_owner || "—"}</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted mb-2">Summit interest</div>
          <div className="flex flex-wrap gap-1">
            {(c.summit_interest || []).map((s: string) => <Badge key={s} tone="accent">{s}</Badge>)}
            {(c.summit_interest || []).length === 0 && <span className="text-sm text-muted">—</span>}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted mb-2">Firmographics</div>
          <div className="text-sm space-y-1">
            <div><span className="text-muted">Industry: </span>{c.industry || "—"}</div>
            <div><span className="text-muted">Employees: </span>{c.number_of_employees || "—"}</div>
            <div><span className="text-muted">Marketing budget: </span>${fmtNum(c.marketing_budget)}</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium">Contacts ({contacts?.length || 0})</h2>
            </div>
            {(!contacts || contacts.length === 0) ? (
              <Empty title="No contacts linked" hint="HubSpot association may be missing or unresolved." />
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Title</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-right px-3 py-2 font-medium">O · C · R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((p: any) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-subtle/50">
                        <td className="px-3 py-2">
                          <Link href={`/contacts/${p.id}`} className="hover:text-accent">
                            <div className="font-medium">{p.first_name} {p.last_name}</div>
                            {p.email && <div className="text-xs text-muted mono">{p.email}</div>}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted">{p.job_title || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(p.key_contact || []).map((k: string) => <Badge key={k} tone="accent">{k}</Badge>)}
                            {p.lead_status && <Badge tone="muted">{p.lead_status}</Badge>}
                            {p.unsubscribed_all_email && <Badge tone="danger">Unsub</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right mono text-xs text-muted">
                          {p.emails_opened || 0} · {p.emails_clicked || 0} · {p.emails_replied || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium">Activity</h2>
            </div>
            {(!activities || activities.length === 0) ? (
              <Empty title="No activity yet" hint="Notes, calls, and agent actions will appear here." />
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

        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-xs uppercase text-muted mb-2">Links</div>
            <div className="text-sm space-y-1.5">
              {c.website_url && <a href={c.website_url} target="_blank" rel="noopener" className="block hover:text-accent truncate">🌐 {c.website_url}</a>}
              {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener" className="block hover:text-accent truncate">💼 LinkedIn</a>}
              {c.twitter_handle && <a href={c.twitter_handle} target="_blank" rel="noopener" className="block hover:text-accent truncate">🐦 Twitter</a>}
              {!c.website_url && !c.linkedin_url && !c.twitter_handle && <span className="text-muted">—</span>}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs uppercase text-muted mb-2">HubSpot</div>
            <div className="text-sm text-muted mono break-all">{c.hubspot_record_id || "—"}</div>
            <div className="text-xs text-muted mt-1">Created {fmtDate(c.hs_create_date)}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
