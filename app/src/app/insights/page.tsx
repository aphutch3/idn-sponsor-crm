import { sql } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { fmtNum } from "@/lib/utils";

export const revalidate = 60;

type BucketRow = { k: string; n: number };
type EngagedRow = { opens: number; clicks: number; replies: number; unsubs: number };

export default async function InsightsPage() {
  const [macroRows, countryRows, engagedRows] = await Promise.all([
    sql<BucketRow[]>`
      select macro_category as k, count(*)::int as n
        from public.company
       where macro_category is not null
       group by macro_category
       order by n desc
    `,
    sql<BucketRow[]>`
      select country_region as k, count(*)::int as n
        from public.company
       where country_region is not null
       group by country_region
       order by n desc
       limit 10
    `,
    sql<EngagedRow[]>`
      select
        coalesce(sum(emails_opened),0)::int  as opens,
        coalesce(sum(emails_clicked),0)::int as clicks,
        coalesce(sum(emails_replied),0)::int as replies,
        coalesce(sum(case when unsubscribed_all_email then 1 else 0 end),0)::int as unsubs
      from public.contact
    `,
  ]);

  const { opens, clicks, replies, unsubs } = engagedRows[0] ?? { opens: 0, clicks: 0, replies: 0, unsubs: 0 };
  const macroMax = macroRows[0]?.n ?? 1;
  const countryMax = countryRows[0]?.n ?? 1;

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
            {macroRows.map((row) => (
              <div key={row.k} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{row.k}</span>
                <div className="w-24 h-2 bg-subtle rounded overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${(row.n / macroMax) * 100}%` }} />
                </div>
                <span className="mono text-xs text-muted w-10 text-right">{row.n}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Top countries</div>
          <div className="space-y-1.5">
            {countryRows.map((row) => (
              <div key={row.k} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{row.k}</span>
                <div className="w-24 h-2 bg-subtle rounded overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${(row.n / countryMax) * 100}%` }} />
                </div>
                <span className="mono text-xs text-muted w-10 text-right">{row.n}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
