import { admin } from "@/lib/supabase";
import { PageHeader, Card, Badge } from "@/components/ui";
import { fmtNum } from "@/lib/utils";

export const revalidate = 60;

export default async function InsightsPage() {
  const db = admin();

  const [{ data: byMacro }, { data: byCountry }, { data: engaged }] = await Promise.all([
    db.from("companies").select("macro_category").not("macro_category","is",null),
    db.from("companies").select("country_region").not("country_region","is",null),
    db.from("contacts").select("emails_opened, emails_clicked, emails_replied, unsubscribed_all_email"),
  ]);

  const macroBuckets: Record<string, number> = {};
  (byMacro || []).forEach((r: any) => macroBuckets[r.macro_category] = (macroBuckets[r.macro_category] || 0) + 1);
  const macroRows = Object.entries(macroBuckets).sort((a,b)=>b[1]-a[1]);

  const countryBuckets: Record<string, number> = {};
  (byCountry || []).forEach((r: any) => countryBuckets[r.country_region] = (countryBuckets[r.country_region] || 0) + 1);
  const countryRows = Object.entries(countryBuckets).sort((a,b)=>b[1]-a[1]).slice(0, 10);

  const total = (engaged || []).length;
  const opens = (engaged || []).reduce((s: number, r: any) => s + (r.emails_opened || 0), 0);
  const clicks = (engaged || []).reduce((s: number, r: any) => s + (r.emails_clicked || 0), 0);
  const replies = (engaged || []).reduce((s: number, r: any) => s + (r.emails_replied || 0), 0);
  const unsubs = (engaged || []).filter((r: any) => r.unsubscribed_all_email).length;

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Insights" subtitle="Portfolio-level breakdowns" />

      <div className="grid grid-cols-4 gap-3 mb-6">
        <Card className="p-4"><div className="text-xs uppercase text-muted">Total opens</div><div className="text-xl font-semibold mono">{fmtNum(opens)}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted">Total clicks</div><div className="text-xl font-semibold mono">{fmtNum(clicks)}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted">Total replies</div><div className="text-xl font-semibold mono">{fmtNum(replies)}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted">Unsubscribes</div><div className="text-xl font-semibold mono">{fmtNum(unsubs)}</div></Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Companies by Macro Category</div>
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {macroRows.map(([k, n]) => {
              const max = Math.max(...Object.values(macroBuckets));
              return (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{k}</span>
                  <div className="w-24 h-2 bg-subtle rounded overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span className="mono text-xs text-muted w-10 text-right">{n}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Top countries</div>
          <div className="space-y-1.5">
            {countryRows.map(([k, n]) => {
              const max = countryRows[0][1] as number;
              return (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{k}</span>
                  <div className="w-24 h-2 bg-subtle rounded overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span className="mono text-xs text-muted w-10 text-right">{n}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
