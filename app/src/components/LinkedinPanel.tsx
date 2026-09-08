"use client";

// LinkedIn signals + snapshots panel + one-click monitor button.
// Drops into any entity detail page (companies, contacts).

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Empty } from "@/components/ui";

type Signal = {
  id: string;
  entity_type: string;
  entity_id: string;
  signal_kind: string;
  before_value: unknown;
  after_value: unknown;
  detected_at: string;
  triaged: boolean;
  dismissed: boolean;
  meta: Record<string, unknown> | null;
};

type Snapshot = {
  id: string;
  entity_type: string;
  entity_id: string;
  fetch_type: string;
  fetched_at: string;
  source_url: string;
  http_status: number | null;
  parsed: Record<string, unknown> | null;
  error: string | null;
};

type QuickMonitorResult = {
  config_id: string;
  config_name: string;
  list_id: string;
};

function fmtAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const btn = "px-2.5 py-1 rounded text-xs font-medium transition";
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`;
const btnGhost = `${btn} bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50`;

function stringifyVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

const SIGNAL_TONE: Record<string, "success" | "warn" | "danger" | "accent" | "muted"> = {
  headline_change: "accent",
  headcount_change: "success",
  about_change: "warn",
  website_change: "warn",
  new_post: "accent",
  new_position: "accent",
  company_added: "success",
  bio_update: "warn",
  other: "muted",
};

export default function LinkedinPanel({
  entityId,
  entityType,
  linkedinUrl,
}: {
  entityId: string;
  entityType: "company" | "contact";
  linkedinUrl: string | null;
}) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTriaged, setShowTriaged] = useState(false);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sig, snap] = await Promise.all([
        fetch(`/api/linkedin/signals?entity_id=${entityId}&entity_type=${entityType}&scope=${showTriaged ? "all" : "open"}&limit=50`).then((r) => r.json()),
        fetch(`/api/linkedin/snapshots?entity_id=${entityId}&entity_type=${entityType}&limit=5`).then((r) => r.json()),
      ]);
      setSignals(sig.signals ?? []);
      setSnapshots(snap.snapshots ?? []);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, showTriaged]);

  useEffect(() => { void load(); }, [load]);

  async function triage(sig: Signal, action: "triage" | "dismiss" | "reopen") {
    setBusy((b) => ({ ...b, [sig.id]: action }));
    try {
      const body =
        action === "triage" ? { triaged: true } :
        action === "dismiss" ? { dismissed: true } :
        { triaged: false, dismissed: false };
      await fetch(`/api/linkedin/signals/${sig.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await load();
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[sig.id]; return n; });
    }
  }

  async function quickMonitor() {
    setBusy((b) => ({ ...b, __create: "creating" }));
    setBanner(null);
    try {
      const res = await fetch("/api/linkedin/monitor/quick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity_id: entityId, entity_type: entityType, run: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBanner({ tone: "err", msg: data.error ?? "monitor creation failed" });
      } else {
        const q = data.quick as QuickMonitorResult;
        const summary = data.summary as { fetches_ok: number; fetches_failed: number; signals_emitted: number } | null;
        setBanner({
          tone: "ok",
          msg: summary
            ? `Monitor "${q.config_name}" created and run: ${summary.fetches_ok} ok, ${summary.fetches_failed} failed, ${summary.signals_emitted} signals emitted.`
            : `Monitor "${q.config_name}" created — will run on the hour.`,
        });
        await load();
      }
    } catch (e) {
      setBanner({ tone: "err", msg: String((e as Error).message) });
    } finally {
      setBusy((b) => { const n = { ...b }; delete n.__create; return n; });
    }
  }

  const latestSnap = snapshots[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">LinkedIn</div>
        <div className="flex items-center gap-2">
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener"
              className={btnGhost}
            >
              Open on LinkedIn ↗
            </a>
          )}
          {linkedinUrl && (
            <button
              className={btnPrimary}
              onClick={quickMonitor}
              disabled={Boolean(busy.__create)}
              title="Create a monitor for this entity's list membership and run it now"
            >
              {busy.__create ? "Setting up…" : "Monitor now"}
            </button>
          )}
        </div>
      </div>

      {!linkedinUrl && (
        <Empty title="No LinkedIn URL on this record" hint="Add a linkedin_url to enable monitoring." />
      )}

      {banner && (
        <div className={`p-2.5 rounded text-xs ${banner.tone === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {banner.msg}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted">Loading…</div>
      ) : (
        <>
          {latestSnap && (
            <Card className="p-3 bg-gray-50">
              <div className="flex items-center gap-2 text-xs mb-2">
                <div className="font-medium">Last snapshot</div>
                <Badge tone={latestSnap.error ? "danger" : "success"}>
                  {latestSnap.error ? "error" : latestSnap.fetch_type}
                </Badge>
                <span className="text-muted">{fmtAgo(latestSnap.fetched_at)}</span>
                <span className="text-muted ml-auto">
                  Total snapshots for this entity: {snapshots.length}
                </span>
              </div>
              {latestSnap.error ? (
                <div className="text-xs text-red-700 mono break-all">{latestSnap.error}</div>
              ) : latestSnap.parsed ? (
                <ParsedFields parsed={latestSnap.parsed} />
              ) : null}
            </Card>
          )}

          <div className="flex items-center gap-2">
            <div className="text-xs font-medium">Signals</div>
            <label className="text-xs text-muted flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showTriaged} onChange={(e) => setShowTriaged(e.target.checked)} />
              show triaged/dismissed
            </label>
          </div>

          {signals.length === 0 ? (
            <div className="text-xs text-muted">
              {showTriaged ? "No signals recorded yet." : "No open signals. Change detection compares each new snapshot to the prior one."}
            </div>
          ) : (
            <div className="space-y-1.5">
              {signals.map((s) => (
                <div key={s.id} className={`border rounded p-2.5 flex items-start gap-3 text-xs ${
                  s.triaged ? "bg-green-50/50 border-green-200" :
                  s.dismissed ? "bg-gray-50 border-gray-200 opacity-60" :
                  "bg-white"
                }`}>
                  <Badge tone={SIGNAL_TONE[s.signal_kind] ?? "muted"}>{s.signal_kind}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-muted">
                      <span className="text-gray-700">{stringifyVal(s.before_value)}</span>
                      <span className="mx-2">→</span>
                      <span className="text-gray-900 font-medium">{stringifyVal(s.after_value)}</span>
                    </div>
                    <div className="text-muted mt-0.5">{fmtAgo(s.detected_at)}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!s.triaged && !s.dismissed && (
                      <>
                        <button className={btnGhost} disabled={Boolean(busy[s.id])} onClick={() => triage(s, "triage")}>Triage</button>
                        <button className={btnGhost} disabled={Boolean(busy[s.id])} onClick={() => triage(s, "dismiss")}>Dismiss</button>
                      </>
                    )}
                    {(s.triaged || s.dismissed) && (
                      <button className={btnGhost} disabled={Boolean(busy[s.id])} onClick={() => triage(s, "reopen")}>Reopen</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ParsedFields({ parsed }: { parsed: Record<string, unknown> }) {
  const kind = parsed.kind as string | undefined;
  const fieldKeys = kind === "company_page"
    ? ["name","tagline","industry","headcount_range","hq_location","website","followers"]
    : kind === "profile_public"
      ? ["name","headline","location","about_excerpt"]
      : Object.keys(parsed).filter((k) => k !== "kind");
  return (
    <div className="text-xs grid grid-cols-2 gap-x-4 gap-y-1">
      {fieldKeys.map((k) => {
        const v = parsed[k];
        if (v === undefined || v === null || v === "") return null;
        const s = String(v);
        return (
          <div key={k} className="truncate">
            <span className="text-muted">{k}:</span> <span className="font-medium">{s.length > 100 ? s.slice(0, 100) + "…" : s}</span>
          </div>
        );
      })}
    </div>
  );
}
