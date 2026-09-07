import Link from "next/link";
import { PageHeader, Card, Stat, Badge } from "@/components/ui";
import { fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Influencers Overview aggregates activity across every cohort.
// Stub data — real numbers land when each cohort is wired to Supabase.
const COHORTS = [
  { key: "speakers",       name: "Event Speakers",  count: 138, active: 24, status: "planned" as const, href: "/influencers/speakers" },
  { key: "socializers",    name: "Socializers",     count: 214, active: 61, status: "planned" as const, href: "/influencers/socializers" },
  { key: "evangelists",    name: "Evangelists",     count: 87,  active: 19, status: "planned" as const, href: "/influencers/evangelists" },
  { key: "open-standards", name: "Open Standards",  count: 42,  active: 8,  status: "planned" as const, href: "/influencers/open-standards" },
];

const RECENT = [
  { cohort: "Speakers",       person: "Kelsey Hightower",       when: "confirmed A3",       metric: "Q4 keynote candidate",       href: "/influencers/speakers" },
  { cohort: "Socializers",    person: "Simon Willison",         when: "12 mentions (30d)",  metric: "reach 148k",                 href: "/influencers/socializers" },
  { cohort: "Evangelists",    person: "Ashley Willis (GitHub)", when: "posted A3 preview",  metric: "engagement 3.2k",            href: "/influencers/evangelists" },
  { cohort: "Standards",      person: "Ted Young (OTel)",       when: "spec update shipped", metric: "OpenTelemetry v1.34",       href: "/influencers/open-standards" },
  { cohort: "Speakers",       person: "Charity Majors",         when: "sent Deploy invite",  metric: "response pending",          href: "/influencers/speakers" },
];

function statusTone(s: "live" | "skeleton" | "planned") {
  if (s === "live") return "success" as const;
  if (s === "skeleton") return "warn" as const;
  return "muted" as const;
}

export default function InfluencersOverviewPage() {
  const totalPeople = COHORTS.reduce((s, c) => s + c.count, 0);
  const totalActive = COHORTS.reduce((s, c) => s + c.active, 0);
  const activeRate = totalPeople > 0 ? ((totalActive / totalPeople) * 100).toFixed(0) : "—";

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="Influencers"
        title="Overview"
        subtitle="Cross-cohort view of every voice that shapes IDN's coverage — speakers, socializers, evangelists, and standards leaders"
        right={<Badge tone="warn">Skeleton · cohorts rolling out</Badge>}
      />

      {/* Top KPIs */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <Stat label="People tracked" value={fmtNum(totalPeople)} sub="across all cohorts" />
        <Stat label="Active (30d)" value={fmtNum(totalActive)} sub="posted, spoke, or shipped" />
        <Stat label="Active rate" value={`${activeRate}%`} sub="active / tracked" />
        <Stat label="Cohorts" value={`${COHORTS.length}`} sub="live or planned" accent />
      </div>

      {/* Cohort breakdown */}
      <div className="mt-8">
        <h3 className="text-sm uppercase tracking-wider text-muted mb-3">Cohort breakdown</h3>
        <Card padded={false}>
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] text-[11px] uppercase tracking-wider text-muted border-b border-subtle px-4 py-2.5 bg-subtle/40 gap-3">
            <div>Cohort</div>
            <div className="text-right">Tracked</div>
            <div className="text-right">Active (30d)</div>
            <div className="text-right">Rate</div>
            <div className="text-right">Status</div>
          </div>
          {COHORTS.map((c) => {
            const rate = c.count > 0 ? `${((c.active / c.count) * 100).toFixed(0)}%` : "—";
            return (
              <Link
                key={c.key}
                href={c.href}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-3 items-center px-4 py-3 border-b border-subtle last:border-b-0 hover:bg-subtle/40 transition-colors"
              >
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-right mono text-sm">{fmtNum(c.count)}</div>
                <div className="text-right mono text-sm">{fmtNum(c.active)}</div>
                <div className="text-right mono text-sm">{rate}</div>
                <div className="text-right">
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </div>
              </Link>
            );
          })}
        </Card>
      </div>

      {/* Recent activity */}
      <div className="mt-8">
        <h3 className="text-sm uppercase tracking-wider text-muted mb-3">Recent activity</h3>
        <Card padded={false}>
          {RECENT.map((r, i) => (
            <Link
              key={i}
              href={r.href}
              className="grid grid-cols-[120px_2fr_1.4fr_160px] gap-3 items-center px-4 py-3 border-b border-subtle last:border-b-0 hover:bg-subtle/40 transition-colors"
            >
              <div><Badge tone="default">{r.cohort}</Badge></div>
              <div className="text-sm font-medium truncate">{r.person}</div>
              <div className="text-xs text-muted">{r.metric}</div>
              <div className="text-xs text-muted text-right">{r.when}</div>
            </Link>
          ))}
        </Card>
      </div>

      {/* Quick launch */}
      <div className="mt-8">
        <h3 className="text-sm uppercase tracking-wider text-muted mb-3">Quick launch</h3>
        <div className="grid grid-cols-4 gap-3">
          <QuickLink href="/influencers/speakers?tab=roster" title="Speaker roster"       sub="Past + confirmed summit speakers" />
          <QuickLink href="/influencers/socializers?tab=reach" title="Top social reach"   sub="X and LinkedIn voices by reach" />
          <QuickLink href="/influencers/evangelists?tab=vendor" title="Vendor evangelists" sub="Group by employer" />
          <QuickLink href="/influencers/open-standards?tab=groups" title="Working groups" sub="OTel, CNCF, MCP, others" />
        </div>
      </div>

      <p className="text-xs text-muted mt-8">
        Overview aggregates data from every cohort. As each cohort ships, its live numbers replace the stub values here.
      </p>
    </div>
  );
}

function QuickLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="block border border-subtle rounded-lg p-4 hover:border-strong hover:bg-subtle/40 transition-colors"
    >
      <div className="text-sm font-medium text-strong">{title}</div>
      <div className="text-xs text-muted mt-1">{sub}</div>
    </Link>
  );
}
