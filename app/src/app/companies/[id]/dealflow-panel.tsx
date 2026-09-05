"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import type { CompanyRow, CompanyContactRow, CompanyActivityRow, CompanySendRow } from "./company-shell";

// Sponsor pursuit pipeline stages (1-7), agent-driven default.
// Stage numbers map onto rank_stage. Names reflect IDN's actual pursuit flow.
const STAGES = [
  { n: "1", label: "Prospect", hint: "Identified · not yet contacted", color: "#94a3b8" },
  { n: "2", label: "Qualified", hint: "Fit + intent verified", color: "#60a5fa" },
  { n: "3", label: "Engaged", hint: "Two-way conversation started", color: "#0ea5e9" },
  { n: "4", label: "Proposal", hint: "Media kit / pricing shared", color: "#14b8a6" },
  { n: "5", label: "Negotiation", hint: "Terms under discussion", color: "#f59e0b" },
  { n: "6", label: "Committed", hint: "Verbal / contract out", color: "#84cc16" },
  { n: "7", label: "Closed-Won", hint: "Signed & booked", color: "#00afa8" },
] as const;

const KEEP_OPTIONS = ["Keep", "Watch", "Pause", "Drop"] as const;

const TIER_PROB: Record<string, number> = {
  "1_Champion": 0.9,
  "2_Advocate": 0.7,
  "3_Cultivate": 0.45,
  "4_Nurture": 0.25,
  "5_Resurrection": 0.1,
  "": 0.35,
};

const STAGE_PROB: Record<string, number> = {
  "1": 0.1, "2": 0.2, "3": 0.35, "4": 0.5, "5": 0.7, "6": 0.9, "7": 1.0,
};

export function DealFlowPanel({
  company,
  contacts,
  activity,
  sends,
}: {
  company: CompanyRow;
  contacts: CompanyContactRow[];
  activity: CompanyActivityRow[];
  sends: CompanySendRow[];
}) {
  const router = useRouter();

  const currentStage = String(company.rank_stage || "").trim() || "1";
  const stageIdx = Math.max(0, STAGES.findIndex((s) => s.n === currentStage));
  const stage = STAGES[stageIdx] || STAGES[0];

  const [saving, setSaving] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const patch = async (label: string, patch: Record<string, any>) => {
    setSaving(label);
    setErr(null);
    try {
      const res = await fetch(`/api/companies/${company.id}/update`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setErr(j.error || res.statusText);
      else router.refresh();
    } catch (e: any) {
      setErr(e.message || "network error");
    } finally {
      setSaving(null);
    }
  };

  // Derived metrics
  const budget = Number(company.marketing_budget || 0);
  const tierProb = TIER_PROB[String(company.sponsor_tier || "")] ?? TIER_PROB[""];
  const stageProb = STAGE_PROB[stage.n] ?? 0.2;
  const blendedProb = Math.round((tierProb * 0.4 + stageProb * 0.6) * 100);
  const summitInterests = company.summit_interest || [];
  const pastConferences = company.conferences || [];
  const speakingAt = company.conference_speaking || [];
  const historyLabel = company.rank_history ? parseHistory(company.rank_history) : null;

  // Pipeline touches — recent activities that indicate deal motion
  const pipelineActivity = activity
    .filter((a) => {
      const meta = (a.meta || {}) as any;
      return (
        meta.channel === "pipeline" ||
        a.kind === "meeting" ||
        a.kind === "summit_invite" ||
        a.kind === "contract_sent" ||
        a.kind === "contract_signed" ||
        (a.subject || "").toLowerCase().includes("pipeline")
      );
    })
    .slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Pipeline strip */}
      <PanelCard title="Pipeline" eyebrow={`Stage ${stage.n} · ${stage.label}`} accent={stage.color}>
        <PipelineStrip currentIdx={stageIdx} onSet={(n) => patch(`stage:${n}`, { rank_stage: n })} saving={saving} />
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          <MiniStat label="Current stage" value={`${stage.n} · ${stage.label}`} sub={stage.hint} />
          <MiniStat
            label="Sponsor tier"
            value={company.sponsor_tier || "—"}
            sub={company.sponsor_tier ? `${Math.round(tierProb * 100)}% base` : "not set"}
          />
          <MiniStat label="Keep status" value={company.keep || "—"} sub={company.stay_on_top ? "Stay on top" : ""} />
          <MiniStat
            label="Customer"
            value={company.is_customer ? "Yes" : "No"}
            sub={historyLabel ? `Last: ${historyLabel}` : ""}
          />
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#dc2626" }}>{err}</div>}
      </PanelCard>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 20 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <PanelCard title="Active opportunities" eyebrow="Summits this company has signaled interest in">
            {summitInterests.length === 0 ? (
              <EmptyState text="No summit interest recorded yet — add one below or via the agent." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {summitInterests.map((s, i) => {
                  const expectedValue = Math.round((budget * blendedProb) / 100 / Math.max(1, summitInterests.length));
                  return (
                    <div key={i} style={oppRowStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div style={{ width: 4, height: 40, background: stage.color, borderRadius: 2 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{s}</div>
                          <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>
                            Stage {stage.n} · {blendedProb}% likely
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <div style={{ fontFamily: "var(--tk-font-mono, monospace)", fontWeight: 700 }}>
                          {expectedValue > 0 ? fmtMoney(expectedValue) : "—"}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--tk-text-muted)" }}>expected</div>
                      </div>
                      <button
                        onClick={() => patch(`drop:${s}`, { summit_interest: summitInterests.filter((x) => x !== s) })}
                        disabled={!!saving}
                        style={dropBtnStyle}
                        title="Remove interest"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <AddInterestRow
              existing={summitInterests}
              onAdd={(v) => patch(`add:${v}`, { summit_interest: [...summitInterests, v] })}
              saving={!!saving}
            />
          </PanelCard>

          <PanelCard title="Historical business" eyebrow="Past sponsorships, speaking, and customer status">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <HistoryColumn label="Past summits" items={pastConferences} accent="#0ea5e9" empty="No past sponsorships on file" />
              <HistoryColumn label="Speaking history" items={speakingAt} accent="#7c3aed" empty="No speaking sessions on file" />
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {company.is_customer && <Badge tone="success">Existing customer</Badge>}
              {company.rank_last_year && (
                <Badge tone="muted">Ranked in {company.rank_last_year}</Badge>
              )}
              {company.rank_frequency && (
                <Badge tone="muted">Frequency {company.rank_frequency}</Badge>
              )}
              {company.stay_on_top && <Badge tone="teal">Stay on top</Badge>}
              {(company.blockers_count || 0) > 0 && (
                <Badge tone="warn">{company.blockers_count} blocker{(company.blockers_count || 0) > 1 ? "s" : ""}</Badge>
              )}
            </div>
          </PanelCard>

          <PanelCard title="Pipeline activity" eyebrow="Recent motion on this deal">
            {pipelineActivity.length === 0 ? (
              <EmptyState text="No pipeline motion logged yet. Stage changes will appear here automatically." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pipelineActivity.map((a) => (
                  <div key={a.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, padding: "8px 0", borderTop: "1px solid var(--tk-border)" }}>
                    <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>{fmtDate(a.occurred_at)}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.subject || a.kind}</div>
                      {a.body && (
                        <div style={{ fontSize: 12, color: "var(--tk-text-secondary)", marginTop: 2 }}>{a.body}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>
        </div>

        {/* Right column: forecast + controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <PanelCard title="Forecast" eyebrow="Weighted by tier + stage" accent={stage.color}>
            <ForecastMeter
              budget={budget}
              blendedProb={blendedProb}
              stageProb={stageProb}
              tierProb={tierProb}
              accent={stage.color}
            />
          </PanelCard>

          <PanelCard title="Deal controls" eyebrow="Agent-driven · explicit human overrides">
            <ControlRow label="Keep status">
              <Segmented
                value={company.keep || ""}
                options={KEEP_OPTIONS as unknown as string[]}
                onSelect={(v) => patch(`keep:${v}`, { keep: v })}
                saving={saving?.startsWith("keep:") ? saving.slice(5) : null}
              />
            </ControlRow>
            <ControlRow label="Stay on top">
              <Toggle
                value={!!company.stay_on_top}
                onChange={(v) => patch("stay_on_top", { stay_on_top: v })}
                saving={saving === "stay_on_top"}
              />
            </ControlRow>
            <ControlRow label="Existing customer">
              <Toggle
                value={!!company.is_customer}
                onChange={(v) => patch("is_customer", { is_customer: v })}
                saving={saving === "is_customer"}
              />
            </ControlRow>
            <ControlRow label="Marketing budget">
              <BudgetInput
                value={budget}
                onSave={(v) => patch("budget", { marketing_budget: v })}
                saving={saving === "budget"}
              />
            </ControlRow>
          </PanelCard>

          <PanelCard title="Signal roll-up" eyebrow="Contacts contributing to this deal">
            <SignalRollup contacts={contacts} sends={sends} />
          </PanelCard>
        </div>
      </div>
    </div>
  );
}

// --- Pipeline strip -----------------------------------------------------

function PipelineStrip({
  currentIdx,
  onSet,
  saving,
}: {
  currentIdx: number;
  onSet: (n: string) => void;
  saving: string | null;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 4 }}>
      {STAGES.map((s, i) => {
        const active = i <= currentIdx;
        const current = i === currentIdx;
        const isSaving = saving === `stage:${s.n}`;
        return (
          <button
            key={s.n}
            onClick={() => onSet(s.n)}
            disabled={!!saving}
            title={`Set stage ${s.n}: ${s.label}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: "10px 12px",
              background: current ? s.color : active ? `${s.color}22` : "var(--tk-bg-muted)",
              color: current ? "white" : active ? "var(--tk-text)" : "var(--tk-text-muted)",
              border: "none",
              borderTop: current ? `3px solid ${s.color}` : "3px solid transparent",
              borderRadius: 6,
              cursor: saving ? "wait" : "pointer",
              opacity: isSaving ? 0.6 : 1,
              transition: "background .15s",
              textAlign: "left" as const,
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: 10, fontFamily: "var(--tk-font-mono, monospace)",
                background: current ? "rgba(255,255,255,.2)" : active ? "white" : "var(--tk-border)",
                color: current ? "white" : active ? s.color : "var(--tk-text-muted)",
                padding: "1px 5px", borderRadius: 3, fontWeight: 700,
              }}>{s.n}</span>
              <span style={{ fontSize: 12, fontWeight: current ? 700 : 600 }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 10, marginTop: 3, color: current ? "rgba(255,255,255,.85)" : "var(--tk-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
              {s.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// --- Forecast meter -----------------------------------------------------

function ForecastMeter({
  budget,
  blendedProb,
  stageProb,
  tierProb,
  accent,
}: {
  budget: number;
  blendedProb: number;
  stageProb: number;
  tierProb: number;
  accent: string;
}) {
  const expected = Math.round(budget * (blendedProb / 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, color: "var(--tk-text-muted)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>Expected value</div>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--tk-font-mono, monospace)", color: accent, marginTop: 4 }}>
          {budget > 0 ? fmtMoney(expected) : "—"}
        </div>
        <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 2 }}>
          {budget > 0 ? `${fmtMoney(budget)} budget × ${blendedProb}% blended` : "No marketing budget on file"}
        </div>
      </div>

      <div>
        <ProbBar label="Stage weight" value={Math.round(stageProb * 100)} accent={accent} />
        <ProbBar label="Tier weight" value={Math.round(tierProb * 100)} accent="#60a5fa" />
        <ProbBar label="Blended" value={blendedProb} accent="#00afa8" bold />
      </div>
    </div>
  );
}

function ProbBar({ label, value, accent, bold }: { label: string; value: number; accent: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ color: "var(--tk-text-muted)", fontWeight: bold ? 600 : 500 }}>{label}</span>
        <span style={{ fontFamily: "var(--tk-font-mono, monospace)", fontWeight: bold ? 700 : 500, color: bold ? accent : "var(--tk-text-secondary)" }}>{value}%</span>
      </div>
      <div style={{ height: bold ? 8 : 6, background: "var(--tk-bg-muted)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: accent, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// --- Controls -----------------------------------------------------------

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBlock: 10, borderTop: "1px solid var(--tk-border)" }}>
      <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--tk-text-muted)", fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

function Segmented({ value, options, onSelect, saving }: { value: string; options: string[]; onSelect: (v: string) => void; saving: string | null }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--tk-bg-muted)", padding: 3, borderRadius: 6 }}>
      {options.map((o) => {
        const on = o === value;
        const isSaving = saving === o;
        return (
          <button
            key={o}
            onClick={() => onSelect(o)}
            disabled={!!saving}
            style={{
              flex: 1, padding: "5px 8px", fontSize: 12, border: "none", borderRadius: 4,
              background: on ? "white" : "transparent",
              color: on ? "var(--tk-text)" : "var(--tk-text-muted)",
              fontWeight: on ? 600 : 500, cursor: saving ? "wait" : "pointer",
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ value, onChange, saving }: { value: boolean; onChange: (v: boolean) => void; saving: boolean }) {
  return (
    <button
      onClick={() => onChange(!value)}
      disabled={saving}
      style={{
        width: 44, height: 24, borderRadius: 999, border: "none",
        background: value ? "#00afa8" : "var(--tk-border)",
        position: "relative", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1, transition: "background .15s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: value ? 23 : 3,
        width: 18, height: 18, background: "white", borderRadius: "50%", transition: "left .15s",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
      }} />
    </button>
  );
}

function BudgetInput({ value, onSave, saving }: { value: number; onSave: (v: number) => void; saving: boolean }) {
  const [draft, setDraft] = React.useState(String(value || ""));
  React.useEffect(() => setDraft(String(value || "")), [value]);
  const changed = String(value || "") !== draft;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="0"
        style={{
          flex: 1, padding: "6px 8px", border: "1px solid var(--tk-border)", borderRadius: 6,
          fontSize: 13, fontFamily: "var(--tk-font-mono, monospace)", background: "white",
        }}
      />
      <button
        onClick={() => onSave(Number(draft) || 0)}
        disabled={saving || !changed}
        className="tk-btn tk-btn-sm tk-btn-primary"
        style={{ opacity: saving || !changed ? 0.4 : 1 }}
      >
        {saving ? "…" : "Save"}
      </button>
    </div>
  );
}

// --- Opportunity add row ------------------------------------------------

function AddInterestRow({ existing, onAdd, saving }: { existing: string[]; onAdd: (v: string) => void; saving: boolean }) {
  const [draft, setDraft] = React.useState("");
  const disabled = saving || !draft.trim() || existing.includes(draft.trim());
  return (
    <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add summit interest (e.g. Enterprise AI, Data Platform)"
        style={{
          flex: 1, padding: "8px 10px", border: "1px solid var(--tk-border)", borderRadius: 6,
          fontSize: 13, background: "white",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) { onAdd(draft.trim()); setDraft(""); }
        }}
      />
      <button
        onClick={() => { onAdd(draft.trim()); setDraft(""); }}
        disabled={disabled}
        className="tk-btn tk-btn-sm"
        style={{ background: "#00afa8", color: "white", opacity: disabled ? 0.4 : 1 }}
      >
        Add
      </button>
    </div>
  );
}

// --- History column ----------------------------------------------------

function HistoryColumn({ label, items, accent, empty }: { label: string; items: string[]; accent: string; empty: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--tk-text-muted)", fontWeight: 600, marginBottom: 8 }}>{label}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--tk-text-muted)", padding: "10px 0" }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--tk-border)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
              <div style={{ fontSize: 13 }}>{c}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Signal roll-up ----------------------------------------------------

function SignalRollup({ contacts, sends }: { contacts: CompanyContactRow[]; sends: CompanySendRow[] }) {
  const totalOpens = contacts.reduce((s, c) => s + (c.emails_opened || 0), 0);
  const totalReplies = contacts.reduce((s, c) => s + (c.emails_replied || 0), 0);
  const keyCount = contacts.filter((c) => (c.key_contact || []).length > 0).length;
  const sendCount = sends.length;
  const anyReply = totalReplies > 0;

  const items = [
    { label: "Key contacts", value: keyCount, sub: `${contacts.length} total` },
    { label: "Tracked sends", value: sendCount, sub: sends[0]?.sent_at ? `Last ${fmtDate(sends[0].sent_at)}` : "None yet" },
    { label: "Opens", value: totalOpens, sub: totalOpens > 0 ? "confirmed interest" : "no opens" },
    { label: "Replies", value: totalReplies, sub: anyReply ? "engaged" : "silent" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {items.map((it) => (
        <div key={it.label} style={{ padding: "10px 12px", border: "1px solid var(--tk-border)", borderRadius: 6, background: "white" }}>
          <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--tk-text-muted)", fontWeight: 600 }}>{it.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--tk-font-mono, monospace)", marginTop: 2 }}>{it.value}</div>
          <div style={{ fontSize: 10, color: "var(--tk-text-muted)", marginTop: 2 }}>{it.sub}</div>
        </div>
      ))}
    </div>
  );
}

// --- Card / utility bits -----------------------------------------------

function PanelCard({ title, eyebrow, accent, children }: { title: string; eyebrow: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="tk-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--tk-border)", borderLeft: accent ? `3px solid ${accent}` : "none" }}>
        <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--tk-text-muted)", fontWeight: 600 }}>{eyebrow}</div>
        <div className="tk-editorial" style={{ fontSize: 18, marginTop: 2 }}>{title}</div>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: "10px 12px", border: "1px solid var(--tk-border)", borderRadius: 6, background: "var(--tk-bg-muted)" }}>
      <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--tk-text-muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--tk-text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 18, border: "1px dashed var(--tk-border-strong)", borderRadius: 6, background: "var(--tk-bg-muted)", color: "var(--tk-text-muted)", fontSize: 13, textAlign: "center" }}>
      {text}
    </div>
  );
}

const oppRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto auto",
  gap: 10,
  alignItems: "center",
  padding: "10px 12px",
  border: "1px solid var(--tk-border)",
  borderRadius: 6,
  background: "white",
};

const dropBtnStyle: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 4, border: "none", background: "var(--tk-bg-muted)",
  color: "var(--tk-text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1,
};

function fmtMoney(n: number): string {
  if (!n || !isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return String(iso); }
}

function parseHistory(h: string): string {
  // rank_history like "2025_2_1" → "2025 · Stage 2 · Freq 1"
  const parts = h.split("_").filter(Boolean);
  if (parts.length === 0) return h;
  const bits: string[] = [];
  if (parts[0]) bits.push(parts[0]);
  if (parts[1]) bits.push(`stage ${parts[1]}`);
  if (parts[2]) bits.push(`freq ${parts[2]}`);
  return bits.join(" · ");
}
