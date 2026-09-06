import Link from "next/link";
import { PageHeader, Card, Badge, Stat } from "@/components/ui";
import { fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Skeleton — matches the shape of the stub in /campaigns.
type Campaign = {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  from: string;
  reply_to: string;
  segment: string;
  audience_size: number;
  status: "draft" | "scheduled" | "sending" | "sent" | "paused";
  scheduled_at?: string;
  sent_at?: string;
  html: string;
  sent?: number;
  delivered?: number;
  opens?: number;
  unique_opens?: number;
  clicks?: number;
  unique_clicks?: number;
  replies?: number;
  unsubscribes?: number;
  bounces?: number;
  spam?: number;
};

const CAMPAIGN: Campaign = {
  id: "c_2026_09_apps_agents",
  name: "A3 Summit — Q4 Save the Date",
  subject: "Apps · Agents · APIs — mark your calendar",
  preheader: "Six weeks out. Here's who's confirmed and what we're covering.",
  from: "John Hutchinson <john@idn.direct>",
  reply_to: "john@idn.direct",
  segment: "Platform Engineering Leaders (2nd Tier)",
  audience_size: 1_842,
  status: "sent",
  sent_at: "2026-09-02T14:00:00Z",
  html: "",
  sent: 1_842,
  delivered: 1_798,
  opens: 612,
  unique_opens: 487,
  clicks: 143,
  unique_clicks: 118,
  replies: 27,
  unsubscribes: 8,
  bounces: 44,
  spam: 2,
};

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

// Skeleton renders all 4 wizard tabs stacked. In a real build these would be
// separate steps with client-side state. Kept flat here so review of every
// section is one scroll.
export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await params; // id is unused for the skeleton — every URL renders the same sample
  const c = CAMPAIGN;

  const steps = [
    { key: "setup", label: "Setup", done: true },
    { key: "audience", label: "Audience", done: true },
    { key: "content", label: "Content", done: true },
    { key: "review", label: "Review & Send", done: c.status !== "draft" },
  ];

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-2 text-xs text-muted mb-3">
        <Link href="/campaigns" className="hover:text-strong">
          Campaigns
        </Link>
        <span>/</span>
        <span className="text-strong">{c.name}</span>
      </div>

      <PageHeader
        title={c.name}
        subtitle={`Subject · ${c.subject}`}
        right={
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(c.status)}>{c.status}</Badge>
            {c.status === "draft" && (
              <button className="text-xs px-3 py-2 rounded-md bg-black text-white font-medium">
                Schedule
              </button>
            )}
            {c.status === "scheduled" && (
              <button className="text-xs px-3 py-2 rounded-md border border-strong">
                Pause
              </button>
            )}
            {c.status === "sent" && (
              <button className="text-xs px-3 py-2 rounded-md border border-strong">
                Duplicate
              </button>
            )}
          </div>
        }
      />

      {/* Step nav (visual only) */}
      <Card className="p-2 mb-6">
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <button
                className={`text-xs px-3 py-1.5 rounded-md font-medium ${
                  s.done
                    ? "bg-black text-white"
                    : "border border-subtle text-muted"
                }`}
              >
                {i + 1}. {s.label}
              </button>
              {i < steps.length - 1 && <span className="text-muted text-xs">→</span>}
            </div>
          ))}
        </div>
      </Card>

      {/* If sent, show performance up top */}
      {(c.status === "sent" || c.status === "sending") && (
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider text-muted mb-2">
            Performance
          </div>
          <div className="grid grid-cols-6 gap-3">
            <Stat label="Sent" value={fmtNum(c.sent ?? 0)} />
            <Stat label="Delivered" value={pct(c.delivered, c.sent)} sub={fmtNum(c.delivered ?? 0)} />
            <Stat label="Opens" value={pct(c.unique_opens, c.delivered)} sub={`${fmtNum(c.unique_opens ?? 0)} unique`} accent />
            <Stat label="Clicks" value={pct(c.unique_clicks, c.delivered)} sub={`${fmtNum(c.unique_clicks ?? 0)} unique`} />
            <Stat label="Replies" value={fmtNum(c.replies ?? 0)} />
            <Stat label="Unsubscribes" value={fmtNum(c.unsubscribes ?? 0)} sub={`${fmtNum(c.bounces ?? 0)} bounces`} />
          </div>
        </div>
      )}

      {/* Two-column body: Setup + Audience left, Content preview right */}
      <div className="grid grid-cols-[1.1fr_1fr] gap-4">
        {/* LEFT — Setup + Audience */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">1. Setup</div>
              <button className="text-xs text-muted hover:text-strong">Edit</button>
            </div>
            <dl className="text-sm space-y-2">
              <Field k="Campaign name" v={c.name} />
              <Field k="Subject line" v={c.subject} />
              <Field k="Preheader" v={c.preheader} />
              <Field k="From" v={c.from} />
              <Field k="Reply to" v={c.reply_to} />
              <Field
                k="Send at"
                v={
                  c.sent_at
                    ? new Date(c.sent_at).toLocaleString()
                    : c.scheduled_at
                    ? new Date(c.scheduled_at).toLocaleString()
                    : "—"
                }
              />
            </dl>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">2. Audience</div>
              <button className="text-xs text-muted hover:text-strong">Edit</button>
            </div>
            <div className="text-sm space-y-2">
              <Field k="Segment" v={c.segment} />
              <Field k="Estimated recipients" v={`${fmtNum(c.audience_size)} contacts`} />
              <Field k="Suppression" v="Unsubscribed · bounced · spam-flagged (auto)" />
            </div>
            <div className="mt-4 border border-subtle rounded-md p-3 text-xs text-muted bg-subtle/40">
              After the segment engine runs, the exact recipient count and per-contact
              deliverability score are pinned to the campaign before send.
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">4. Review & Send</div>
              <button className="text-xs text-muted hover:text-strong">Open</button>
            </div>
            <ul className="text-sm space-y-2">
              <Check ok label="Subject and preheader present" />
              <Check ok label="From address verified (idn.direct)" />
              <Check ok label="Segment resolves to a non-empty list" />
              <Check ok label="Content has plaintext + HTML versions" />
              <Check ok={false} label="Test send to john@yes4yes.com (recommended)" />
              <Check ok={false} label="Spam score under 5.0 (not calculated yet)" />
            </ul>
          </Card>
        </div>

        {/* RIGHT — Content preview */}
        <div>
          <Card padded={false}>
            <div className="flex items-center justify-between p-4 border-b border-subtle">
              <div className="text-sm font-medium">3. Content · Preview</div>
              <div className="flex items-center gap-1">
                <button className="text-xs px-2.5 py-1 rounded-md border border-subtle">
                  Desktop
                </button>
                <button className="text-xs px-2.5 py-1 rounded-md text-muted hover:border-subtle border border-transparent">
                  Mobile
                </button>
                <button className="text-xs px-2.5 py-1 rounded-md text-muted hover:border-subtle border border-transparent">
                  Plain text
                </button>
              </div>
            </div>
            <div className="p-4 bg-subtle/40">
              <div className="text-[11px] text-muted mb-2 mono">
                From: {c.from} · To: [recipient]
              </div>
              <div className="text-[11px] text-muted mb-3 mono">Subject: {c.subject}</div>
              <div className="bg-white border border-subtle rounded-md p-6 text-sm leading-relaxed">
                <div className="text-lg font-semibold mb-3">
                  Apps · Agents · APIs
                </div>
                <p className="mb-3">Hi [First name],</p>
                <p className="mb-3">
                  Save the date — the A3 Summit returns the week of{" "}
                  <strong>November 3, 2026</strong>. Five days of the enterprise IT
                  teams building the composable stack: apps on top of agents, agents on
                  top of APIs.
                </p>
                <p className="mb-3">
                  Confirmed early: LinkedIn, Vanguard, Bank of America, Alaska Airlines,
                  and a dozen more platform-engineering teams sharing what actually
                  shipped in 2026.
                </p>
                <p className="mb-4">
                  <a href="#" className="text-teal-700 underline">
                    Reserve your seat →
                  </a>
                </p>
                <p className="text-xs text-muted mt-6 border-t border-subtle pt-3">
                  You are receiving this because you attended a prior IDN summit or
                  requested our research. <a href="#" className="underline">Unsubscribe</a>.
                </p>
              </div>
            </div>
          </Card>

          <div className="mt-3 text-[11px] text-muted">
            Preview is a static skeleton. Real content will render from the campaign's
            stored HTML and merge fields.
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs text-muted min-w-[110px]">{k}</dt>
      <dd className="text-sm text-strong text-right flex-1">{v}</dd>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
          ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {ok ? "✓" : "!"}
      </span>
      <span className={ok ? "" : "text-muted"}>{label}</span>
    </li>
  );
}
