import { sql } from "@/lib/db";
import { Card, Stat } from "@/components/ui";
import Link from "next/link";
import { fmtNum, fmtDate } from "@/lib/utils";
import { Star, TrendingUp, FolderTree, Users, Building2 } from "lucide-react";

type KpiRow = {
  total_companies: number;
  total_contacts: number;
  customers: number;
  stay_on_top: number;
  key_contacts: number;
};

type TierRow = { sponsor_tier: string; n: number };
type MacroRow = { macro_category: string; company_count: number };
type RecentEngRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_id: string | null;
  emails_opened: number | null;
  last_email_open_date: string | null;
  last_email_click_date: string | null;
};

// Dashboard panel — portfolio snapshot with KPIs, tier + macro breakdowns, recent opens.
// Extracted from the former / (Overview) page so /start can host it as a tab.
export async function DashboardPanel() {
  const [kpiRows, tiers, macros, recentEng] = await Promise.all([
    // Consolidate 5 counts into a single query.
    sql<KpiRow[]>`
      select
        (select count(*) from public.company)::int as total_companies,
        (select count(*) from public.contact)::int as total_contacts,
        (select count(*) from public.company where is_customer = true)::int as customers,
        (select count(*) from public.company where stay_on_top = true)::int as stay_on_top,
        (select count(*) from public.v_key_contacts)::int as key_contacts
    `,
    sql<TierRow[]>`
      select sponsor_tier, count(*)::int as n
        from public.company
       where sponsor_tier is not null
       group by sponsor_tier
    `,
    sql<MacroRow[]>`
      select macro_category, company_count from public.v_taxonomy
    `,
    sql<RecentEngRow[]>`
      select id, first_name, last_name, email, company_id,
             emails_opened, last_email_open_date, last_email_click_date
        from public.contact
       where last_email_open_date is not null
       order by last_email_open_date desc
       limit 8
    `,
  ]);

  const kpis = kpiRows[0] ?? {
    total_companies: 0, total_contacts: 0, customers: 0, stay_on_top: 0, key_contacts: 0,
  };

  const tierBuckets: Record<string, number> = {};
  for (const r of tiers) tierBuckets[r.sponsor_tier] = r.n;
  const tierOrder = ["0_Gorilla", "1_Top Tier", "2_2nd Tier", "3_Recent", "4_Attention", "5_Resurrection", "6_Try Again", "90_Purchased"];

  const macroBuckets: Record<string, number> = {};
  for (const r of macros) macroBuckets[r.macro_category] = (macroBuckets[r.macro_category] || 0) + (r.company_count ?? 0);
  const macroRows = Object.entries(macroBuckets).sort((a, b) => b[1] - a[1]);
  const maxMacro = macroRows[0]?.[1] || 1;

  return (
    <div style={{ maxWidth: 1240 }}>
      <div className="text-xs text-muted mb-4">
        {fmtNum(kpis.total_companies)} companies · {fmtNum(kpis.total_contacts)} contacts · agent-driven
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <Stat label="Companies" value={fmtNum(kpis.total_companies)} icon={<Building2 className="w-3.5 h-3.5" />} />
        <Stat label="Contacts" value={fmtNum(kpis.total_contacts)} icon={<Users className="w-3.5 h-3.5" />} />
        <Stat label="Customers" value={fmtNum(kpis.customers)} icon={<Star className="w-3.5 h-3.5" />} accent />
        <Stat label="Stay on top" value={fmtNum(kpis.stay_on_top)} icon={<TrendingUp className="w-3.5 h-3.5" />} accent />
        <Stat label="Key contacts" value={fmtNum(kpis.key_contacts)} icon={<Star className="w-3.5 h-3.5" />} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="tk-eyebrow">Sponsor tiers</div>
            <Link href="/pipeline" style={{ color: "var(--tk-teal)", fontSize: 12 }}>Pipeline →</Link>
          </div>
          <div className="space-y-2">
            {tierOrder.filter(t => tierBuckets[t]).map(t => {
              const n = tierBuckets[t];
              const max = Math.max(...Object.values(tierBuckets));
              return (
                <div key={t} className="flex items-center gap-2 text-sm">
                  <span className="w-32 truncate">{t}</span>
                  <div className="tk-progress" style={{ flex: 1 }}>
                    <div className="tk-progress-fill lime" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--tk-text-muted)", width: 32, textAlign: "right" }}>{n}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="tk-eyebrow flex items-center gap-1.5"><FolderTree className="w-3.5 h-3.5" /> Macro categories</div>
            <Link href="/start?tab=marketplace" style={{ color: "var(--tk-teal)", fontSize: 12 }}>Browse marketplace →</Link>
          </div>
          <div className="space-y-2">
            {macroRows.slice(0, 8).map(([k, n]) => (
              <Link key={k} href={{ pathname: "/start", query: { tab: "marketplace", macro: k } }} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{k}</span>
                <div className="tk-progress" style={{ width: 96 }}>
                  <div className="tk-progress-fill teal" style={{ width: `${(n / maxMacro) * 100}%` }} />
                </div>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--tk-text-muted)", width: 40, textAlign: "right" }}>{fmtNum(n)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="tk-eyebrow">Recent email opens</div>
          <Link href="/contacts" style={{ color: "var(--tk-teal)", fontSize: 12 }}>All contacts →</Link>
        </div>
        {recentEng.length === 0 ? (
          <div style={{ color: "var(--tk-text-muted)", fontSize: 13, padding: 16, textAlign: "center" }}>No engagement data yet.</div>
        ) : (
          <div>
            {recentEng.map((c) => (
              <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center gap-2 text-sm" style={{ padding: "8px 4px", borderTop: "1px solid var(--tk-border)" }}>
                <span className="flex-1 truncate">{c.first_name} {c.last_name}</span>
                <span style={{ fontSize: 12, color: "var(--tk-text-muted)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{c.email}</span>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--tk-text-muted)", width: 96, textAlign: "right" }}>{fmtDate(c.last_email_open_date)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
