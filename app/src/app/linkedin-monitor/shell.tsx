"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, Card, Badge, Empty } from "@/components/ui";

type ListInfo = { id: string; name: string; kind: string; entity_types: string[] };
type Binding = { id: string; binding_type: string; honor_suppressions: boolean; list_id: string; lists?: ListInfo | null };
type Config = {
  id: string;
  name: string;
  list_binding_id: string | null;
  fetch_types: string[];
  cadence_seconds: number;
  jitter_seconds: number;
  batch_size: number;
  per_fetch_delay_ms: number;
  active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  meta: Record<string, unknown>;
  list_bindings?: (Binding & { lists?: ListInfo | null }) | null;
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

const FETCH_TYPE_OPTIONS = [
  { value: "company_page", label: "Company page" },
  { value: "profile_public", label: "Public profile" },
  { value: "company_posts", label: "Company posts (not yet wired)" },
  { value: "company_people", label: "Company people (not yet wired)" },
  { value: "profile_activity", label: "Profile activity (not yet wired)" },
];

function fmtAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

const btn = "px-3 py-1.5 rounded text-xs font-medium transition";
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`;
const btnGhost = `${btn} bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50`;
const btnDanger = `${btn} bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50`;

export default function LinkedinMonitorShell() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot[]>>({});

  async function refresh() {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([
        fetch("/api/linkedin/monitor/configs").then((r) => r.json()),
        fetch("/api/lists/bindings").then((r) => r.json()),
      ]);
      setConfigs(c.configs ?? []);
      setBindings(b.bindings ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function loadSnapshots(configId: string) {
    const r = await fetch(`/api/linkedin/snapshots?config_id=${configId}&limit=10`).then((x) => x.json());
    setSnapshots((prev) => ({ ...prev, [configId]: r.snapshots ?? [] }));
  }

  async function runNow(config: Config) {
    setBusy((b) => ({ ...b, [config.id]: "running" }));
    setBanner(null);
    try {
      const res = await fetch(`/api/linkedin/monitor/configs/${config.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBanner({ tone: "err", msg: data.error ?? "run failed" });
      } else {
        const s = data.summary;
        setBanner({
          tone: "ok",
          msg: `${config.name}: attempted ${s.fetches_attempted}, ok ${s.fetches_ok}, failed ${s.fetches_failed}, signals ${s.signals_emitted}${s.reason ? ` — ${s.reason}` : ""}`,
        });
        await refresh();
        if (expanded === config.id) await loadSnapshots(config.id);
      }
    } catch (e) {
      setBanner({ tone: "err", msg: String((e as Error).message) });
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[config.id]; return n; });
    }
  }

  async function toggleActive(config: Config) {
    setBusy((b) => ({ ...b, [config.id]: "toggling" }));
    try {
      await fetch(`/api/linkedin/monitor/configs/${config.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !config.active }),
      });
      await refresh();
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[config.id]; return n; });
    }
  }

  async function del(config: Config) {
    if (!confirm(`Delete monitor "${config.name}"? Snapshots and signals are kept.`)) return;
    setBusy((b) => ({ ...b, [config.id]: "deleting" }));
    try {
      await fetch(`/api/linkedin/monitor/configs/${config.id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[config.id]; return n; });
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="LinkedIn monitor"
        subtitle="Hourly worker that fetches LinkedIn pages via Apify, hashes them, and emits signals on change."
        right={
          <button className={btnPrimary} onClick={() => setShowCreate(true)}>
            + New monitor
          </button>
        }
      />

      {banner && (
        <div
          className={`mb-4 p-3 rounded text-sm ${
            banner.tone === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {showCreate && (
        <CreateForm
          bindings={bindings}
          onCancel={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void refresh(); }}
        />
      )}

      {loading ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : configs.length === 0 ? (
        <Empty
          title="No monitors yet"
          hint="Create a monitor to watch LinkedIn pages for a list of companies or profiles. Change detection runs hourly."
        />
      ) : (
        <div className="space-y-3">
          {configs.map((c) => {
            const listName = c.list_bindings?.lists?.name ?? "(no list bound)";
            const listKind = c.list_bindings?.lists?.kind ?? "";
            const listEntities = (c.list_bindings?.lists?.entity_types ?? []).join(",");
            const isExpanded = expanded === c.id;
            const snaps = snapshots[c.id] ?? [];
            const pauseReason = (c.meta as { paused_reason?: string })?.paused_reason;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium">{c.name}</div>
                      <Badge tone={c.active ? "success" : "muted"}>{c.active ? "active" : "paused"}</Badge>
                      {c.fetch_types.map((ft) => (
                        <Badge key={ft} tone="muted">{ft}</Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      List: <span className="font-medium">{listName}</span>{" "}
                      {listKind && <span className="mono">({listKind}·{listEntities})</span>}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      Cadence: {fmtDuration(c.cadence_seconds)} · Batch: {c.batch_size} · Per-fetch delay: {Math.round(c.per_fetch_delay_ms / 1000)}s · Last run: {fmtAgo(c.last_run_at)}
                    </div>
                    {pauseReason && (
                      <div className="text-xs text-red-700 mt-1">Auto-paused: {pauseReason}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      className={btnPrimary}
                      onClick={() => runNow(c)}
                      disabled={Boolean(busy[c.id]) || !c.list_binding_id}
                      title={c.list_binding_id ? "Run this monitor now" : "Bind a list first"}
                    >
                      {busy[c.id] === "running" ? "Running…" : "Run now"}
                    </button>
                    <button className={btnGhost} onClick={() => toggleActive(c)} disabled={Boolean(busy[c.id])}>
                      {c.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      className={btnGhost}
                      onClick={() => {
                        const next = isExpanded ? null : c.id;
                        setExpanded(next);
                        if (next && !snapshots[c.id]) void loadSnapshots(c.id);
                      }}
                    >
                      {isExpanded ? "Hide" : "Snapshots"}
                    </button>
                    <button className={btnDanger} onClick={() => del(c)} disabled={Boolean(busy[c.id])}>
                      Delete
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="text-xs font-medium mb-2">Recent snapshots</div>
                    {snaps.length === 0 ? (
                      <div className="text-xs text-muted">No snapshots yet — run the monitor to create the first one.</div>
                    ) : (
                      <div className="space-y-2">
                        {snaps.map((s) => (
                          <SnapshotRow key={s.id} snap={s} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SnapshotRow({ snap }: { snap: Snapshot }) {
  const parsed = snap.parsed ?? {};
  const isCompany = parsed.kind === "company_page";
  const isProfile = parsed.kind === "profile_public";
  const badge = snap.error
    ? <Badge tone="danger">error</Badge>
    : snap.http_status && snap.http_status >= 400
      ? <Badge tone="warn">{snap.http_status}</Badge>
      : <Badge tone="success">ok</Badge>;
  return (
    <div className="border rounded p-3 bg-gray-50">
      <div className="flex items-center gap-2 text-xs">
        {badge}
        <Badge tone="muted">{snap.fetch_type}</Badge>
        <span className="text-muted">{fmtAgo(snap.fetched_at)}</span>
        <a href={snap.source_url} target="_blank" rel="noopener" className="text-blue-600 hover:underline ml-auto truncate max-w-xs">
          {snap.source_url}
        </a>
      </div>
      {snap.error && (
        <div className="mt-2 text-xs text-red-700 mono break-all">{snap.error}</div>
      )}
      {isCompany && (
        <div className="mt-2 text-xs grid grid-cols-2 gap-x-4 gap-y-1">
          {["name","tagline","industry","headcount_range","hq_location","website","followers"].map((k) => {
            const v = (parsed as Record<string, unknown>)[k];
            if (!v) return null;
            const str = String(v);
            return (
              <div key={k} className="truncate">
                <span className="text-muted">{k}:</span> <span className="font-medium">{str.length > 80 ? str.slice(0, 80) + "…" : str}</span>
              </div>
            );
          })}
        </div>
      )}
      {isProfile && (
        <div className="mt-2 text-xs grid grid-cols-2 gap-x-4 gap-y-1">
          {["name","headline","location","about_excerpt"].map((k) => {
            const v = (parsed as Record<string, unknown>)[k];
            if (!v) return null;
            const str = String(v);
            return (
              <div key={k} className="truncate">
                <span className="text-muted">{k}:</span> <span className="font-medium">{str.length > 80 ? str.slice(0, 80) + "…" : str}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateForm({
  bindings,
  onCancel,
  onCreated,
}: {
  bindings: Binding[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [bindingId, setBindingId] = useState<string>(bindings[0]?.id ?? "");
  const [fetchTypes, setFetchTypes] = useState<string[]>(["company_page"]);
  const [cadenceHours, setCadenceHours] = useState<number>(6);
  const [batchSize, setBatchSize] = useState<number>(15);
  const [delaySec, setDelaySec] = useState<number>(60);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const usableBindings = useMemo(
    () => bindings.filter((b) => {
      const ets = b.lists?.entity_types ?? [];
      return ets.includes("company") || ets.includes("contact");
    }),
    [bindings],
  );

  async function save() {
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/linkedin/monitor/configs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          list_binding_id: bindingId || null,
          fetch_types: fetchTypes,
          cadence_seconds: cadenceHours * 3600,
          batch_size: batchSize,
          per_fetch_delay_ms: delaySec * 1000,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "save failed"); return; }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 mb-4 border-2 border-blue-200">
      <div className="font-medium mb-3">New monitor</div>
      {err && <div className="text-xs text-red-700 mb-2">{err}</div>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Name</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Watch top sponsors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">List binding</label>
          <select
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={bindingId}
            onChange={(e) => setBindingId(e.target.value)}
          >
            <option value="">— pick a list —</option>
            {usableBindings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.lists?.name ?? b.id.slice(0, 8)} ({(b.lists?.entity_types ?? []).join(",") || "?"}·{b.binding_type})
              </option>
            ))}
          </select>
          {usableBindings.length === 0 && (
            <div className="text-xs text-muted mt-1">
              No list bindings yet. Create a list and bind it via the segments page first.
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Fetch types</label>
          <div className="space-y-1">
            {FETCH_TYPE_OPTIONS.map((ft) => {
              const disabled = ft.value !== "company_page" && ft.value !== "profile_public";
              return (
                <label key={ft.value} className={`flex items-center gap-2 text-xs ${disabled ? "opacity-50" : ""}`}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={fetchTypes.includes(ft.value)}
                    onChange={(e) => {
                      setFetchTypes((prev) => e.target.checked ? [...prev, ft.value] : prev.filter((x) => x !== ft.value));
                    }}
                  />
                  {ft.label}
                </label>
              );
            })}
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Cadence (hours between checks)</label>
            <input type="number" min={1} max={168} className="w-full border rounded px-2 py-1.5 text-sm"
              value={cadenceHours} onChange={(e) => setCadenceHours(Number(e.target.value) || 6)} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Batch size per tick</label>
            <input type="number" min={1} max={30} className="w-full border rounded px-2 py-1.5 text-sm"
              value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value) || 15)} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Per-fetch delay (sec)</label>
            <input type="number" min={5} max={300} className="w-full border rounded px-2 py-1.5 text-sm"
              value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value) || 60)} />
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button className={btnPrimary} disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Create monitor"}
        </button>
        <button className={btnGhost} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </Card>
  );
}
