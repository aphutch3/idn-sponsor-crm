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
    <div style={{ padding: "32px 40px", maxWidth: 1240, margin: "0 auto" }}>
      <PageHeader
        eyebrow="Overview"
        title="Sponsor CRM"
        subtitle={`${fmtNum(totalCompanies || 0)} companies · ${fmtNum(totalContacts || 0)} contacts · agent-driven`}
      />

      <div className="grid grid-cols-5 gap-3 mb-6">
        <Stat label="Companies" value={fmtNum(totalCompanies || 0)} icon={<Building2 className="w-3.5 h-3.5" />} />
        <Stat label="Contacts" value={fmtNum(totalContacts || 0)} icon={<Users className="w-3.5 h-3.5" />} />
        <Stat label="Customers" value={fmtNum(customers || 0)} icon={<Star className="w-3.5 h-3.5" />} accent />
        <Stat label="Stay on top" value={fmtNum(stayOnTop || 0)} icon={<TrendingUp className="w-3.5 h-3.5" />} accent />
        <Stat label="Key contacts" value={fmtNum(keyContacts || 0)} icon={<Star className="w-3.5 h-3.5" />} />
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
            <Link href="/taxonomy" style={{ color: "var(--tk-teal)", fontSize: 12 }}>Browse taxonomy →</Link>
          </div>
          <div className="space-y-2">
            {macroRows.slice(0, 8).map(([k, n]) => (
              <Link key={k} href={{ pathname: "/taxonomy", query: { macro: k } }} className="flex items-center gap-2 text-sm">
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
        {(!recentEng || recentEng.length === 0) ? (
          <div style={{ color: "var(--tk-text-muted)", fontSize: 13, padding: 16, textAlign: "center" }}>No engagement data yet.</div>
        ) : (
          <div>
            {recentEng.map((c: any) => (
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
