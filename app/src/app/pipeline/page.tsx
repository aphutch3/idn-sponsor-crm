import { admin } from "@/lib/supabase";
import { Card, PageHeader, Badge } from "@/components/ui";
import Link from "next/link";

export const revalidate = 30;

const TIER_ORDER = [
  "0_Gorilla",
  "1_Top Tier",
  "2_2nd Tier",
  "3_Recent",
  "4_Attention",
  "5_Resurrection",
  "6_Try Again",
  "90_Purchased",
];

export default async function PipelinePage() {
  const db = admin();
  const { data: companies } = await db.from("companies")
    .select("id, name, sponsor_tier, macro_category, summit_interest, domain")
    .not("sponsor_tier", "is", null)
    .order("name");

  const byTier: Record<string, any[]> = {};
  (companies || []).forEach(c => {
    const k = c.sponsor_tier || "—";
    (byTier[k] = byTier[k] || []).push(c);
  });

  const orderedTiers = TIER_ORDER.filter(t => byTier[t]).concat(
    Object.keys(byTier).filter(t => !TIER_ORDER.includes(t))
  );

  return (
    <div className="p-8">
      <PageHeader title="Sponsor Pipeline" subtitle="Grouped by Sponsor Tier · drag support coming — read-only for now" />

      <div className="flex gap-3 overflow-x-auto pb-4">
        {orderedTiers.map(tier => (
          <div key={tier} className="w-72 shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <Badge tone="accent">{tier}</Badge>
              <span className="mono text-xs text-muted">{byTier[tier].length}</span>
            </div>
            <div className="space-y-2">
              {byTier[tier].map(c => (
                <Link key={c.id} href={`/companies/${c.id}`} className="block">
                  <Card className="p-3 hover:border-accent transition-colors">
                    <div className="font-medium text-sm truncate">{c.name}</div>
                    {c.domain && <div className="text-xs text-muted mono truncate">{c.domain}</div>}
                    {c.macro_category && <div className="text-xs text-muted mt-1 truncate">{c.macro_category}</div>}
                    {(c.summit_interest || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(c.summit_interest || []).slice(0, 2).map((s: string) => (
                          <Badge key={s} tone="default" className="text-[10px]">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
