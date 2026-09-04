import { db } from "@/lib/supabase";
import { PageHeader, Card, Stat, Badge } from "@/components/ui";
import Link from "next/link";
import { fmtNum, fmtDate } from "@/lib/utils";
import { Star, TrendingUp, FolderTree, Users, Building2 } from "lucide-react";

export const revalidate = 30;

export default async function OverviewPage() {
  const supa = db();

  const [
    { count: totalCompanies },
    { count: totalContacts },
    { count: customers },
    { count: stayOnTop },
    { count: keyContacts },
    { data: tiers },
    { data: macros },
    { data: recentEng },
  ] = await Promise.all([
    supa.from("companies").select("*", { count: "exact", head: true }),
    supa.from("contacts").select("*", { count: "exact", head: true }),
    supa.from("companies").select("*", { count: "exact", head: true }).eq("is_customer", true),
    supa.from("companies").select("*", { count: "exact", head: true }).eq("stay_on_top", true),
    supa.from("v_key_contacts").select("*", { count: "exact", head: true }),
    supa.from("companies").select("sponsor_tier, sponsor_tier_rank").not("sponsor_tier", "is", null),
    supa.from("v_taxonomy").select("macro_category, company_count"),
    supa.from("contacts").select("id, first_name, last_name, email, company_id, emails_opened, last_email_open_date, last_email_click_date").not("last_email_open_date", "is", null).order("last_email_open_date", { ascending: false }).limit(8),
  ]);

  const tierBuckets: Record<string, number> = {};
  (tiers || []).forEach((r: any) => tierBuckets[r.sponsor_tier] = (tierBuckets[r.sponsor_tier] || 0) + 1);
  const tierOrder = ["0_Gorilla", "1_Top Tier", "2_2nd Tier", "3_Recent", "4_Attention", "5_Resurrection", "6_Try Again", "90_Purchased"];

  const macroBuckets: Record<string, number> = {};
  (macros || []).forEach((r: any) => macroBuckets[r.macro_category] = (macroBuckets[r.macro_category] || 0) + r.company_count);
  const macroRows = Object.entries(macroBuckets).sort((a, b) => b[1] - a[1]);
  const maxMacro = macroRows[0]?.[1] || 1;

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Sponsor CRM"
        subtitle={`${fmtNum(totalCompanies || 0)} companies · ${fmtNum(totalContacts || 0)} contacts · agent-driven`}
      />

      {/* Priority stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <Stat label="Companies" value={fmtNum(totalCompanies || 0)} icon={<Building2 className="w-3.5 h-3.5" />} />
        <Stat label="Contacts" value={fmtNum(totalContacts || 0)} icon={<Users className="w-3.5 h-3.5" />} />
        <Stat label="Customers" value={fmtNum(customers || 0)} icon={<Star className="w-3.5 h-3.5" />} accent />
        <Stat label="Stay on top" value={fmtNum(stayOnTop || 0)} icon={<TrendingUp className="w-3.5 h-3.5" />} accent />
        <Stat label="Key contacts" value={fmtNum(keyContacts || 0)} icon={<Star className="w-3.5 h-3.5" />} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Sponsor tiers */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Sponsor tiers</div>
            <Link href="/pipeline" className="text-xs text-accent hover:underline">Pipeline →</Link>
          </div>
          <div className="space-y-1.5">
            {tierOrder.filter(t => tierBuckets[t]).map(t => {
              const n = tierBuckets[t];
              const max = Math.max(...Object.values(tierBuckets));
              return (
                <div key={t} className="flex items-center gap-2 text-sm">
                  <span className="w-32 truncate">{t}</span>
                  <div className="flex-1 h-2 bg-subtle rounded overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span className="mono text-xs text-muted w-8 text-right">{n}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Macro categories */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium flex items-center gap-1.5"><FolderTree className="w-3.5 h-3.5" /> Macro categories</div>
            <Link href="/taxonomy" className="text-xs text-accent hover:underline">Browse taxonomy →</Link>
          </div>
          <div className="space-y-1.5">
            {macroRows.slice(0, 8).map(([k, n]) => (
              <Link key={k} href={{ pathname: "/taxonomy", query: { macro: k } }} className="flex items-center gap-2 text-sm hover:text-accent group">
                <span className="flex-1 truncate">{k}</span>
                <div className="w-24 h-2 bg-subtle rounded overflow-hidden">
                  <div className="h-full bg-accent/70 group-hover:bg-accent" style={{ width: `${(n / maxMacro) * 100}%` }} />
                </div>
                <span className="mono text-xs text-muted w-10 text-right">{fmtNum(n)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent engagement */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Most recent email opens</div>
          <Link href="/contacts" className="text-xs text-accent hover:underline">All contacts →</Link>
        </div>
        {(!recentEng || recentEng.length === 0) ? (
          <div className="text-sm text-muted py-4 text-center">No engagement data yet.</div>
        ) : (
          <div className="space-y-1">
            {recentEng.map((c: any) => (
              <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center gap-2 text-sm px-2 py-1.5 -mx-2 rounded hover:bg-subtle">
                <span className="flex-1 truncate">{c.first_name} {c.last_name}</span>
                <span className="text-xs text-muted truncate max-w-[240px]">{c.email}</span>
                <span className="mono text-xs text-muted w-24 text-right">{fmtDate(c.last_email_open_date)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
