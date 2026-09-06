import Link from "next/link";
import { PageHeader, Card, Badge, Stat } from "@/components/ui";
import { fmtNum } from "@/lib/utils";

export const revalidate = 30;

// Skeleton stub data — replace with real Supabase queries once the campaigns
// schema and Resend wiring land.
type Campaign = {
  id: string;
  name: string;
  subject: string;
  from: string;
  segment: string;
  audience_size: number;
  status: "draft" | "scheduled" | "sending" | "sent" | "paused";
  scheduled_at?: string;
  sent_at?: string;
  sent?: number;
  delivered?: number;
  opens?: number;
  clicks?: number;
  replies?: number;
  unsubscribes?: number;
  bounces?: number;
};

const STUB: Campaign[] = [
  {
    id: "c_2026_09_apps_agents",
    name: "A3 Summit — Q4 Save the Date",
    subject: "Apps · Agents · APIs — mark your calendar",
    from: "John Hutchinson <john@idn.direct>",
    segment: "Platform Engineering Leaders (2nd Tier)",
    audience_size: 1_842,
    status: "sent",
    sent_at: "2026-09-02T14:00:00Z",
    sent: 1_842,
    delivered: 1_798,
    opens: 612,
    clicks: 143,
    replies: 27,
    unsubscribes: 8,
    bounces: 44,
  },
  {
    id: "c_2026_09_resurrect",
    name: "Resurrection wave — dormant sponsors",
    subject: "Small ask: 15 minutes to compare notes on 2027",
    from: "John Hutchinson <john@idn.direct>",
    segment: "5_Resurrection",
    audience_size: 486,
    status: "scheduled",
    scheduled_at: "2026-09-08T13:00:00Z",
  },
  {
    id: "c_2026_09_deploy_survey",
    name: "Deploy Summit sponsor survey",
    subject: "3 questions on your 2026 deploy priorities",
    from: "IDN Research <research@idn.direct>",
    segment: "Deploy Summit — attended sponsors",
    audience_size: 214,
    status: "draft",
  },
  {
    id: "c_2026_08_recent_leads",
    name: "Recent leads — first touch",
    subject: "Welcome — here's what we're publishing this quarter",
    from: "John Hutchinson <john@idn.direct>",
    segment: "3_Recent",
    audience_size: 312,
    status: "sending",
    scheduled_at: "2026-09-05T18:00:00Z",
    sent: 189,
    delivered: 184,
    opens: 41,
    clicks: 8,
    replies: 2,
    unsubscribes: 0,
    bounces: 5,
  },
  {
    id: "c_2026_08_attention",
    name: "Attention list — high-value nudge",
    subject: "Two ideas for your Q4 pipeline",
    from: "John Hutchinson <john@idn.direct>",
    segment: "4_Attention",
    audience_size: 128,
    status: "paused",
    scheduled_at: "2026-09-06T15:00:00Z",
  },
];

function statusTone(s: Campaign["status"]) {
  switch (s) {
    case "sent":
      return "success" as const;
    case "sending":
      return "warn" as const;
    case "scheduled":
      return "teal" as const;
    case "paused":
      return "danger" as const;
    default:
      return "muted" as const;
  }
}

function pct(n?: number, d?: number) {
  if (!n || !d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

export default async function CampaignsPage() {
  const campaigns = STUB;

  const totals = campaigns.reduce(
    (acc, c) => {
      acc.audience += c.audience_size;
      acc.sent += c.sent ?? 0;
      acc.opens += c.opens ?? 0;
      acc.clicks += c.clicks ?? 0;
      return acc;
    },
    { audience: 0, sent: 0, opens: 0, clicks: 0 }
  );

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Email Manager"
        subtitle="Segment-driven Resend campaigns · agent-drafted, human-approved"
        right={
          <div className="flex items-center gap-2">
            <Badge tone="warn">Skeleton · Resend not wired</Badge>
            <Link
              href="/engager/email/new"
              className="inline-flex items-center gap-2 rounded-md bg-black text-white text-xs font-medium px-3 py-2 hover:opacity-90"
            >
              + New Campaign
            </Link>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <Stat label="Total audience" value={fmtNum(totals.audience)} sub="across all campaigns" />
        <Stat label="Emails sent" value={fmtNum(totals.sent)} sub="lifetime" />
        <Stat
          label="Open rate"
          value={pct(totals.opens, totals.sent)}
          sub={`${fmtNum(totals.opens)} opens`}
        />
        <Stat
          label="Click rate"
          value={pct(totals.clicks, totals.sent)}
          sub={`${fmtNum(totals.clicks)} clicks`}
          accent
        />
      </div>

      {/* Filters row (visual only for now) */}
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted mr-2">Filter</span>
          {(["All", "Draft", "Scheduled", "Sending", "Sent", "Paused"] as const).map((t, i) => (
            <button
              key={t}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                i === 0 ? "bg-black text-white border-black" : "border-subtle text-muted hover:border-strong"
              }`}
            >
              {t}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <input
              placeholder="Search campaigns…"
              className="text-xs px-3 py-1.5 border border-subtle rounded-md w-56"
            />
          </div>
        </div>
      </Card>

      {/* Campaign list */}
      <Card padded={false}>
        <div className="grid grid-cols-[2.2fr_1.4fr_100px_90px_90px_90px_110px] gap-3 text-[11px] uppercase tracking-wider text-muted border-b border-subtle px-4 py-2.5 bg-subtle/40">
          <div>Campaign</div>
          <div>Audience</div>
          <div className="text-right">Sent</div>
          <div className="text-right">Open %</div>
          <div className="text-right">Click %</div>
          <div className="text-right">Reply</div>
          <div className="text-right">Status</div>
        </div>
        {campaigns.map((c) => (
          <Link
            key={c.id}
            href={`/engager/email/${c.id}`}
            className="grid grid-cols-[2.2fr_1.4fr_100px_90px_90px_90px_110px] gap-3 items-center px-4 py-3 border-b border-subtle last:border-b-0 hover:bg-subtle/40 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{c.name}</div>
              <div className="text-xs text-muted truncate">{c.subject}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs truncate">{c.segment}</div>
              <div className="text-[11px] text-muted mono">{fmtNum(c.audience_size)} contacts</div>
            </div>
            <div className="text-right mono text-sm">{c.sent ? fmtNum(c.sent) : "—"}</div>
            <div className="text-right mono text-sm">{pct(c.opens, c.sent)}</div>
            <div className="text-right mono text-sm">{pct(c.clicks, c.sent)}</div>
            <div className="text-right mono text-sm">{c.replies ?? "—"}</div>
            <div className="text-right">
              <Badge tone={statusTone(c.status)}>{c.status}</Badge>
            </div>
          </Link>
        ))}
      </Card>

      <p className="text-[11px] text-muted mt-4">
        Skeleton data — the list, KPIs, and detail views render, but nothing sends. Wire the
        campaigns table and the Resend send endpoint to make this live.
      </p>
    </div>
  );
}
