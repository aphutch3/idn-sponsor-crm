import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { PrioritiesPanel } from "@/components/start-panels/priorities-panel";
import { MarketplacePanel } from "@/components/start-panels/marketplace-panel";
import { DashboardPanel } from "@/components/start-panels/dashboard-panel";
import { StartSearch } from "@/components/start-search";

export const revalidate = 30;

type Tab = "priorities" | "marketplace" | "dashboard";
const TABS: { key: Tab; label: string; sub: string }[] = [
  { key: "priorities",  label: "Priorities",  sub: "Key contacts & customers to stay on top of" },
  { key: "marketplace", label: "Marketplace", sub: "Browse the portfolio by Macro → Group → Subcategory" },
  { key: "dashboard",   label: "Dashboard",   sub: "Portfolio snapshot: tiers, categories, engagement" },
];

// Marketplace also reads macro/group/sub from the same searchParams.
export default async function StartPage({ searchParams }: { searchParams: { tab?: string; macro?: string; group?: string; sub?: string } }) {
  const tab: Tab = TABS.some(t => t.key === searchParams.tab) ? (searchParams.tab as Tab) : "priorities";
  const active = TABS.find(t => t.key === tab)!;

  return (
    <div className="p-8">
      <PageHeader
        eyebrow="Start"
        title="Start here"
        subtitle={active.sub}
      />

      <div className="mb-4">
        <StartSearch />
      </div>

      <div className="flex items-stretch border-b border-border mb-6" role="tablist">
        {TABS.map(t => {
          const isActive = t.key === tab;
          // Preserve marketplace drill-down params only when switching TO marketplace; drop them otherwise.
          const query: Record<string, string> = { tab: t.key };
          if (t.key === "marketplace") {
            if (searchParams.macro) query.macro = searchParams.macro;
            if (searchParams.group) query.group = searchParams.group;
            if (searchParams.sub)   query.sub   = searchParams.sub;
          }
          return (
            <Link
              key={t.key}
              href={{ pathname: "/start", query }}
              role="tab"
              aria-selected={isActive}
              className={`flex-1 text-center py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-fg hover:border-border"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div>
        {tab === "priorities"  && <PrioritiesPanel />}
        {tab === "marketplace" && <MarketplacePanel searchParams={searchParams} />}
        {tab === "dashboard"   && <DashboardPanel />}
      </div>
    </div>
  );
}
