import { sql } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import Link from "next/link";
import { fmtDate } from "@/lib/utils";
import { Star, TrendingUp, Users } from "lucide-react";

type KeyContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  key_contact: string[] | null;
  lead_status: string | null;
  company_name: string | null;
  company_id: string | null;
  sponsor_tier: string | null;
  emails_opened: number | null;
  emails_clicked: number | null;
  emails_replied: number | null;
  last_email_send_date: string | null;
  unsubscribed_all_email: boolean | null;
};

type StayOnTopRow = {
  id: string;
  name: string;
  domain: string | null;
  sponsor_tier: string | null;
  macro_category: string | null;
  rank_history: string | null;
  rank_last_year: string | null;
  rank_frequency: string | null;
  is_customer: boolean | null;
  summit_interest: string[] | null;
};

// Priorities panel — the people and companies to stay on top of, in one screen.
// Extracted from the former /priorities page so /start can host it as a tab.
export async function PrioritiesPanel() {
  const [keyContacts, stayOnTop, keyTagRows] = await Promise.all([
    sql<KeyContactRow[]>`
      select id, first_name, last_name, email, job_title, key_contact, lead_status,
             company_name, company_id, sponsor_tier,
             emails_opened, emails_clicked, emails_replied,
             last_email_send_date, unsubscribed_all_email
        from public.v_key_contacts
       order by emails_opened desc nulls last
       limit 50
    `,
    sql<StayOnTopRow[]>`
      select id, name, domain, sponsor_tier, macro_category,
             rank_history, rank_last_year, rank_frequency,
             is_customer, summit_interest
        from public.company
       where stay_on_top = true
       order by sponsor_tier_rank asc nulls last, name
    `,
    // Flatten key_contact tags across all key contacts for the tag histogram.
    sql<Array<{ tag: string; n: number }>>`
      select tag, count(*)::int as n
        from public.v_key_contacts, unnest(key_contact) as tag
       group by tag
       order by n desc
    `,
  ]);

  const keyCounts: Record<string, number> = {};
  for (const row of keyTagRows) keyCounts[row.tag] = row.n;

  return (
    <div className="max-w-6xl">
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
          <div className="text-2xl font-semibold">{stayOnTop.length}</div>
          <div className="text-xs text-muted mt-1">companies flagged to stay on top of — recent customers or top-tier</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted mb-2">
            <Users className="w-3.5 h-3.5" /> Key Contacts
          </div>
          <div className="text-2xl font-semibold">{keyContacts.length}</div>
          <div className="text-xs text-muted mt-1">tagged people needing regular touch</div>
        </Card>
      </div>

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-medium">Customers to stay on top of</h2>
          <span className="text-xs text-muted mono">({stayOnTop.length})</span>
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
              {stayOnTop.map((c) => (
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
              {stayOnTop.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted text-sm">No companies flagged yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

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
              {keyContacts.map((c) => (
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
                      {(c.key_contact || []).map((tag: string) => <Badge key={tag} tone="accent">{tag}</Badge>)}
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
