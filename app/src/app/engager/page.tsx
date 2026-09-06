import Link from "next/link";
import { PageHeader, Card, Stat, Badge } from "@/components/ui";
import { fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Overview aggregates activity across every Engager sub-app.
// Stub data — real numbers land when each sub-app is wired to Supabase.
const CHANNELS = [
  { key: "email",    name: "Email Manager",  sent: 2031, engaged: 653, status: "skeleton" as const, href: "/engager/email" },
  { key: "surveyor", name: "Surveyor",       sent: 0,    engaged: 0,   status: "planned"  as const, href: "/engager/surveyor" },
  { key: "ads",      name: "Ad Manager",     sent: 0,    engaged: 0,   status: "planned"  as const, href: "/engager/ads" },
  { key: "video",    name: "Video Channels", sent: 0,    engaged: 0,   status: "planned"  as const, href: "/engager/video" },
];

const RECENT = [
  { channel: "Email",    campaign: "A3 Summit — Q4 Save the Date",        when: "2 days ago",  metric: "1,842 sent · 33.2% open", href: "/engager/email/c_2026_09_apps_agents" },
  { channel: "Email",    campaign: "Recent leads — first touch",           when: "5 days ago",  metric: "189 sent · 21.7% open",  href: "/engager/email/c_2026_09_first_touch" },
  { channel: "Email",    campaign: "Deploy Summit sponsor survey",         when: "draft",       metric: "214 recipients queued",   href: "/engager/email/c_2026_09_deploy_survey" },
  { channel: "Video",    campaign: "A3 Summit — session highlight reel",   when: "planned",     metric: "12 clips in queue",       href: "/engager/video" },
  { channel: "Surveyor", campaign: "Post-summit sponsor NPS",              when: "planned",     metric: "template ready",          href: "/engager/surveyor" },
  { channel: "Social",   campaign: "A3 Summit — LinkedIn drumbeat",         when: "planned",     metric: "6 posts queued",          href: "/engager/social" },
];

function statusTone(s: "live" | "skeleton" | "planned") {
  if (s === "live") return "success" as const;
  if (s === "skeleton") return "warn" as const;
  return "muted" as const;
}

export default function EngagerOverviewPage() {
  const totalSent = CHANNELS.reduce((s, c) => s + c.sent, 0);
  const totalEngaged = CHANNELS.reduce((s, c) => s + c.engaged, 0);
  const engagementRate = totalSent > 0 ? ((totalEngaged / totalSent) * 100).toFixed(1) : "—";
  const liveChannels = CHANNELS.filter((c) => c.status !== "planned").length;

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="The Engager"
        title="Overview"
        subtitle="Cross-channel engagement dashboard — email, surveys, ads, video, social"
        right={<Badge tone="warn">Skeleton · sub-apps rolling out</Badge>}
      />

      {/* Top KPIs */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <Stat label="Total sent" value={fmtNum(totalSent)} sub="across all channels" />
        <Stat label="Engaged" value={fmtNum(totalEngaged)} sub="opens · clicks · responses" />
        <Stat label="Engagement rate" value={typeof engagementRate === "string" && engagementRate !== "—" ? `${engagementRate}%` : "—"} sub="engaged / sent" />
        <Stat label="Channels tracked" value={`${liveChannels} / ${CHANNELS.length}`} sub="live or skeleton" accent />
      </div>

      {/* Channel breakdown */}
      <div className="mt-8">
        <h3 className="text-sm uppercase tracking-wider text-muted mb-3">Channel breakdown</h3>
        <Card padded={false}>
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] text-[11px] uppercase tracking-wider text-muted border-b border-subtle px-4 py-2.5 bg-subtle/40 gap-3">
            <div>Channel</div>
            <div className="text-right">Sent</div>
            <div className="text-right">Engaged</div>
            <div className="text-right">Rate</div>
            <div className="text-right">Status</div>
          </div>
          {CHANNELS.map((c) => {
            const rate = c.sent > 0 ? `${((c.engaged / c.sent) * 100).toFixed(1)}%` : "—";
            return (
              <Link
                key={c.key}
                href={c.href}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-3 items-center px-4 py-3 border-b border-subtle last:border-b-0 hover:bg-subtle/40 transition-colors"
              >
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-right mono text-sm">{c.sent > 0 ? fmtNum(c.sent) : "—"}</div>
                <div className="text-right mono text-sm">{c.engaged > 0 ? fmtNum(c.engaged) : "—"}</div>
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
              className="grid grid-cols-[110px_2fr_1.4fr_130px] gap-3 items-center px-4 py-3 border-b border-subtle last:border-b-0 hover:bg-subtle/40 transition-colors"
            >
              <div><Badge tone="default">{r.channel}</Badge></div>
              <div className="text-sm font-medium truncate">{r.campaign}</div>
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
          <QuickLink href="/engager/email/new"      title="New email campaign"    sub="Segment → template → send" />
          <QuickLink href="/engager/campaigner/new" title="New multi-channel plan" sub="Coordinate email + video + ads" />
          <QuickLink href="/engager/surveyor/new"   title="New survey"             sub="Attendee, sponsor, NPS" />
          <QuickLink href="/engager/builder/landing" title="New landing page"      sub="Agent-driven, on-brand" />
        </div>
      </div>

      <p className="text-xs text-muted mt-8">
        Overview aggregates data from every Engager sub-app. As each sub-app ships, its live numbers replace the stub values here.
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
