import { db } from "@/lib/supabase";
import { PageHeader, Card, Badge } from "@/components/ui";
import Link from "next/link";
import { fmtDate, fmtNum } from "@/lib/utils";
import { Star, TrendingUp, Users } from "lucide-react";

export const revalidate = 30;

// Priorities = the people and companies to stay on top of, in one screen.

export default async function PrioritiesPage() {
  const supa = db();

  const [{ data: keyContacts }, { data: stayOnTop }, { data: byKey }] = await Promise.all([
    supa.from("v_key_contacts").select("id, first_name, last_name, email, job_title, key_contact, lead_status, company_name, company_id, sponsor_tier, emails_opened, emails_clicked, emails_replied, last_email_send_date, unsubscribed_all_email").order("emails_opened", { ascending: false, nullsFirst: false }).limit(50),
    supa.from("companies").select("id, name, domain, sponsor_tier, macro_category, rank_history, rank_last_year, rank_frequency, is_customer, summit_interest").eq("stay_on_top", true).order("sponsor_tier_rank", { ascending: true, nullsFirst: false }).order("name"),
    supa.from("v_key_contacts").select("key_contact"),
  ]);

  // Bucket key contacts by their tag (FRIEND, SPEAKER, TARGET…)
  const keyCounts: Record<string, number> = {};
  (byKey || []).forEach((c: any) => (c.key_contact || []).forEach((k: string) => keyCounts[k] = (keyCounts[k] || 0) + 1));

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Priorities"
        subtitle="Key Contacts to nurture · Customers to stay on top of"
      />

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted mb-2">
            <Star className="w-3.5 h-3.5" /> Key Contact tags
          </div>
          <div className="space-y-1.5">
            {Object.entries(keyCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <Link key={k} href={{ pathname: "/contacts", query: { key: k } }} className="flex items-center justify-between text-sm hover:text-accent">
                <span>{k}</span>
                <span className="mono text-xs text-muted">{n}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted mb-2">
            <TrendingUp className="w-3.5 h-3.5" /> Rank History
          </div>
          <div className="text-2xl font-semibold">{stayOnTop?.length || 0}</div>
          <div className="text-xs text-muted mt-1">companies flagged to stay on top of — recent customers or top-tier</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted mb-2">
            <Users className="w-3.5 h-3.5" /> Key Contacts
          </div>
          <div className="text-2xl font-semibold">{keyContacts?.length || 0}</div>
          <div className="text-xs text-muted mt-1">tagged people needing regular touch</div>
        </Card>
      </div>

      {/* Stay on top of */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-medium">Customers to stay on top of</h2>
          <span className="text-xs text-muted mono">({stayOnTop?.length || 0})</span>
        </div>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Company</th>
                <th className="text-left px-4 py-2 font-medium">Tier</th>
                <th className="text-left px-4 py-2 font-medium">Last sponsor</th>
                <th className="text-left px-4 py-2 font-medium">Rank history</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
                <th className="text-left px-4 py-2 font-medium">Summit interest</th>
              </tr>
            </thead>
            <tbody>
              {(stayOnTop || []).map((c: any) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-subtle/50">
                  <td className="px-4 py-2">
                    <Link href={`/companies/${c.id}`} className="hover:text-accent">
                      <div className="font-medium">{c.name}</div>
                      {c.domain && <div className="text-xs text-muted mono">{c.domain}</div>}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{c.sponsor_tier ? <Badge tone="accent">{c.sponsor_tier}</Badge> : "—"}</td>
                  <td className="px-4 py-2 mono text-xs">{c.rank_last_year || "—"}{c.rank_frequency ? ` · ${c.rank_frequency}` : ""}</td>
                  <td className="px-4 py-2 mono text-xs text-muted">{c.rank_history || "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted">{c.macro_category || "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(c.summit_interest || []).slice(0, 2).map((s: string) => <Badge key={s} tone="default">{s}</Badge>)}
                    </div>
                  </td>
                </tr>
              ))}
              {(!stayOnTop || stayOnTop.length === 0) && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted text-sm">No companies flagged yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      {/* Key contacts */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-medium">Key Contacts</h2>
          <span className="text-xs text-muted mono">(top 50 by engagement)</span>
          <Link href="/contacts?key=FRIEND" className="ml-auto text-xs text-accent hover:underline">All key contacts →</Link>
        </div>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Contact</th>
                <th className="text-left px-4 py-2 font-medium">Company</th>
                <th className="text-left px-4 py-2 font-medium">Tags</th>
                <th className="text-left px-4 py-2 font-medium">Last emailed</th>
                <th className="text-right px-4 py-2 font-medium">O · C · R</th>
              </tr>
            </thead>
            <tbody>
              {(keyContacts || []).map((c: any) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-subtle/50">
                  <td className="px-4 py-2">
                    <Link href={`/contacts/${c.id}`} className="hover:text-accent">
                      <div className="font-medium">{c.first_name} {c.last_name}</div>
                      <div className="text-xs text-muted">{c.job_title || "—"}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {c.company_name ? (
                      <Link href={`/companies/${c.company_id}`} className="hover:text-accent text-sm">{c.company_name}</Link>
                    ) : <span className="text-muted text-sm">—</span>}
                    {c.sponsor_tier && <div className="mt-0.5"><Badge tone="accent">{c.sponsor_tier}</Badge></div>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(c.key_contact || []).map((k: string) => <Badge key={k} tone="accent">{k}</Badge>)}
                      {c.unsubscribed_all_email && <Badge tone="danger">Unsub</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2 mono text-xs text-muted">{fmtDate(c.last_email_send_date)}</td>
                  <td className="px-4 py-2 text-right mono text-xs text-muted">
                    {c.emails_opened || 0} · {c.emails_clicked || 0} · {c.emails_replied || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
