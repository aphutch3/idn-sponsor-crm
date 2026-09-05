"use client";
import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import type { CompanyRow, CompanyContactRow } from "./company-shell";

// --- Seniority tiering --------------------------------------------------

type Tier = { key: string; label: string; rank: number; color: string };

const TIERS: Tier[] = [
  { key: "c",   label: "C-Suite",     rank: 0, color: "#111318" },
  { key: "vp",  label: "VP / SVP",    rank: 1, color: "#00afa8" },
  { key: "dir", label: "Director",    rank: 2, color: "#0a66c2" },
  { key: "mgr", label: "Manager",     rank: 3, color: "#7c3aed" },
  { key: "ic",  label: "Individual",  rank: 4, color: "#6b7280" },
  { key: "unk", label: "Uncategorized", rank: 5, color: "#9ca3af" },
];

function tierFor(title: string | null | undefined): Tier {
  const t = (title || "").toLowerCase();
  if (!t) return TIERS[5];
  if (/\b(ceo|cto|cfo|cmo|coo|cio|cso|cro|cpo|cdo|cxo|chief|founder|co-?founder|owner|president|managing partner|managing director)\b/.test(t)) return TIERS[0];
  if (/\b(vp|vice president|svp|evp|senior vice president|executive vice president)\b/.test(t)) return TIERS[1];
  if (/\b(director|head of|group lead|principal|partner)\b/.test(t)) return TIERS[2];
  if (/\b(manager|lead|supervisor)\b/.test(t)) return TIERS[3];
  if (/\b(engineer|analyst|specialist|associate|coordinator|representative|account|consultant|designer|writer|editor|producer|architect|scientist|developer|marketer|strategist|planner)\b/.test(t)) return TIERS[4];
  return TIERS[5];
}

function functionFor(title: string | null | undefined): string {
  const t = (title || "").toLowerCase();
  if (!t) return "Other";
  if (/\b(engineer|developer|architect|devops|sre|platform|infrastructure|security|data|ml|ai|research|scientist)\b/.test(t)) return "Engineering / Tech";
  if (/\b(product|ux|design)\b/.test(t)) return "Product / Design";
  if (/\b(market|brand|content|demand|growth|comms|pr|communication)\b/.test(t)) return "Marketing";
  if (/\b(sales|account|revenue|business development|bd|partnerships|customer success|cs|solutions)\b/.test(t)) return "Sales / Revenue";
  if (/\b(finance|accounting|controller|treasurer|fp&a)\b/.test(t)) return "Finance";
  if (/\b(people|talent|hr|recruit|human resource)\b/.test(t)) return "People / HR";
  if (/\b(operations?|ops|coo|chief of staff|program|project|pmo)\b/.test(t)) return "Operations";
  if (/\b(legal|counsel|compliance)\b/.test(t)) return "Legal";
  if (/\b(client|customer|service)\b/.test(t)) return "Client Services";
  if (/\b(ceo|cxo|founder|owner|president|managing)\b/.test(t)) return "Executive";
  return "Other";
}

// --- Main panel ---------------------------------------------------------

export function ContactsPanel({
  company,
  contacts,
}: {
  company: CompanyRow;
  contacts: CompanyContactRow[];
}) {
  const [view, setView] = React.useState<"list" | "hierarchy">("list");
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [sort, setSort] = React.useState<"seniority" | "opens" | "name" | "status">("seniority");
  const [filter, setFilter] = React.useState("");
  const [tierFilter, setTierFilter] = React.useState<string | null>(null);

  const enriched = React.useMemo(
    () => contacts.map((c) => ({ ...c, _tier: tierFor(c.job_title), _fn: functionFor(c.job_title) })),
    [contacts]
  );

  const filtered = enriched
    .filter((c) => {
      if (tierFilter && c._tier.key !== tierFilter) return false;
      if (!filter) return true;
      const q = filter.toLowerCase();
      const name = `${c.first_name || ""} ${c.last_name || ""} ${c.full_name || ""}`.toLowerCase();
      return (
        name.includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.job_title || "").toLowerCase().includes(q) ||
        c._fn.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "name") return `${a.last_name || ""}`.localeCompare(`${b.last_name || ""}`);
      if (sort === "status") return `${a.lead_status || ""}`.localeCompare(`${b.lead_status || ""}`);
      if (sort === "opens") return (b.emails_opened || 0) - (a.emails_opened || 0);
      // seniority
      if (a._tier.rank !== b._tier.rank) return a._tier.rank - b._tier.rank;
      return (b.emails_opened || 0) - (a.emails_opened || 0);
    });

  // Coverage: how many tiers have at least one contact
  const tierCounts: Record<string, number> = {};
  enriched.forEach((c) => {
    tierCounts[c._tier.key] = (tierCounts[c._tier.key] || 0) + 1;
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header card with view toggle + filters */}
        <div className="tk-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="tk-eyebrow">Sort · filter · expand</div>
              <div className="tk-editorial" style={{ fontSize: 18, marginTop: 2 }}>Contacts · {contacts.length}</div>
            </div>
            <div style={{ display: "flex", gap: 4, background: "var(--tk-bg-muted)", padding: 3, borderRadius: 6 }}>
              {(["list", "hierarchy"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    border: "none",
                    borderRadius: 4,
                    background: view === v ? "white" : "transparent",
                    color: view === v ? "var(--tk-text)" : "var(--tk-text-muted)",
                    fontWeight: view === v ? 600 : 500,
                    cursor: "pointer",
                    boxShadow: view === v ? "0 1px 2px rgba(15,23,42,.08)" : "none",
                  }}
                >
                  {v === "list" ? "List" : "Hierarchy"}
                </button>
              ))}
            </div>
          </div>

          {view === "list" && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  placeholder="Filter by name, email, title, function"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: "8px 12px",
                    border: "1px solid var(--tk-border)",
                    borderRadius: 6,
                    fontSize: 13,
                    background: "white",
                  }}
                />
                <div style={{ display: "flex", gap: 4, background: "var(--tk-bg-muted)", padding: 3, borderRadius: 6 }}>
                  {(["seniority", "opens", "name", "status"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSort(s)}
                      style={{
                        padding: "6px 10px",
                        fontSize: 12,
                        border: "none",
                        borderRadius: 4,
                        background: sort === s ? "white" : "transparent",
                        color: sort === s ? "var(--tk-text)" : "var(--tk-text-muted)",
                        fontWeight: sort === s ? 600 : 500,
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tier chip filters */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                <TierChip
                  active={tierFilter === null}
                  onClick={() => setTierFilter(null)}
                  color="#111318"
                  label={`All (${contacts.length})`}
                />
                {TIERS.filter((t) => tierCounts[t.key]).map((t) => (
                  <TierChip
                    key={t.key}
                    active={tierFilter === t.key}
                    onClick={() => setTierFilter(tierFilter === t.key ? null : t.key)}
                    color={t.color}
                    label={`${t.label} (${tierCounts[t.key]})`}
                  />
                ))}
              </div>

              {filtered.length === 0 ? (
                <Placeholder text={contacts.length === 0 ? "No contacts linked yet." : "No contacts match this filter."} />
              ) : (
                <div style={{ borderTop: "1px solid var(--tk-border)" }}>
                  {filtered.map((c) => (
                    <ContactAccordionRow
                      key={c.id}
                      contact={c}
                      isOpen={!!expanded[c.id]}
                      onToggle={() => setExpanded((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {view === "hierarchy" && (
            <HierarchyGraph company={company} contacts={enriched} />
          )}
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Coverage" eyebrow="Seniority tiers">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TIERS.map((t) => {
              const count = tierCounts[t.key] || 0;
              const pct = contacts.length ? (count / contacts.length) * 100 : 0;
              return (
                <div key={t.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: count ? "var(--tk-text)" : "var(--tk-text-muted)", fontWeight: count ? 600 : 400 }}>
                      {t.label}
                    </span>
                    <span style={{ color: "var(--tk-text-muted)", fontFamily: "var(--tk-font-mono, monospace)" }}>
                      {count}
                    </span>
                  </div>
                  <div style={{ height: 5, background: "var(--tk-bg-muted)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(pct, count ? 4 : 0)}%`, background: t.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>

        <PanelCard title="Functions" eyebrow="Where they sit">
          <FunctionSummary contacts={enriched} />
        </PanelCard>

        <PanelCard title="Key contacts" eyebrow="Priority">
          <KeyContactList contacts={enriched} />
        </PanelCard>
      </div>
    </div>
  );
}

// --- Accordion row ------------------------------------------------------

function ContactAccordionRow({
  contact,
  isOpen,
  onToggle,
}: {
  contact: CompanyContactRow & { _tier: Tier; _fn: string };
  isOpen: boolean;
  onToggle: () => void;
}) {
  const name = `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.full_name || contact.email || "—";
  const initials = ((contact.first_name?.[0] || "") + (contact.last_name?.[0] || "")).toUpperCase() || "·";

  return (
    <div style={{ borderBottom: "1px solid var(--tk-border)" }}>
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "16px 32px 1.6fr 1.6fr 1fr auto",
          gap: 12,
          padding: "12px 6px",
          cursor: "pointer",
          alignItems: "center",
        }}
      >
        <span style={{ color: "var(--tk-text-muted)", fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
        <div
          style={{
            width: 30, height: 30, borderRadius: "50%",
            background: contact._tier.color, color: "white",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600,
          }}
          title={contact._tier.label}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          {contact.email && (
            <div style={{ fontSize: 11, color: "var(--tk-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {contact.email}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--tk-text-secondary)", minWidth: 0 }}>
          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{contact.job_title || "—"}</div>
          <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>{contact._fn}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {(contact.key_contact || []).map((k) => (
            <Badge key={k} tone="accent">{k}</Badge>
          ))}
          {contact.lead_status && <Badge>{contact.lead_status}</Badge>}
          {contact.unsubscribed_all_email && <Badge tone="danger">Unsub</Badge>}
        </div>
        <div style={{ fontSize: 12, color: "var(--tk-text-muted)", fontFamily: "var(--tk-font-mono, monospace)", textAlign: "right" }}>
          {contact.emails_opened || 0} · {contact.emails_clicked || 0} · {contact.emails_replied || 0}
        </div>
      </div>

      {isOpen && (
        <div
          style={{
            padding: "6px 6px 18px 60px",
            background: "var(--tk-bg-muted)",
            borderTop: "1px solid var(--tk-border)",
            marginTop: 0,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 14 }}>
            {/* Left: identity + tier */}
            <SummaryList
              items={[
                ["Seniority", contact._tier.label],
                ["Function", contact._fn],
                ["Title", contact.job_title],
                ["Status", contact.lead_status],
              ]}
            />
            {/* Middle: reach */}
            <SummaryList
              items={[
                ["Email", contact.email],
                ["Phone", contact.phone],
                ["Last activity", fmtDate(contact.last_activity_date)],
                ["Unsubscribed", contact.unsubscribed_all_email ? "Yes" : "No"],
              ]}
            />
            {/* Right: engagement KPIs + actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                <MiniKpi label="Deliv" value={contact.emails_delivered || 0} />
                <MiniKpi label="Opens" value={contact.emails_opened || 0} accent />
                <MiniKpi label="Clicks" value={contact.emails_clicked || 0} accent={!!contact.emails_clicked} />
                <MiniKpi label="Reply" value={contact.emails_replied || 0} accent={!!contact.emails_replied} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link
                  href={`/contacts/${contact.id}`}
                  className="tk-btn tk-btn-sm tk-btn-primary"
                  style={{ textDecoration: "none" }}
                >
                  Open contact →
                </Link>
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="tk-btn tk-btn-sm tk-btn-ghost"
                    style={{ textDecoration: "none" }}
                  >
                    Email
                  </a>
                )}
                {contact.linkedin_url && (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="tk-btn tk-btn-sm tk-btn-ghost"
                    style={{ textDecoration: "none" }}
                  >
                    LinkedIn ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Hierarchy graph ----------------------------------------------------

function HierarchyGraph({
  company,
  contacts,
}: {
  company: CompanyRow;
  contacts: (CompanyContactRow & { _tier: Tier; _fn: string })[];
}) {
  // Group contacts by tier, keeping only tiers with at least one member.
  const byTier: Record<string, (CompanyContactRow & { _tier: Tier; _fn: string })[]> = {};
  contacts.forEach((c) => {
    (byTier[c._tier.key] = byTier[c._tier.key] || []).push(c);
  });
  const activeTiers = TIERS.filter((t) => byTier[t.key]?.length);

  if (contacts.length === 0) {
    return <Placeholder text="No contacts to graph yet." />;
  }

  return (
    <div style={{ padding: "8px 0 4px" }}>
      {/* Company root */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        <div
          style={{
            padding: "10px 18px",
            border: "2px solid var(--tk-text)",
            borderRadius: 10,
            background: "white",
            fontWeight: 700,
            fontSize: 14,
            textAlign: "center",
            minWidth: 220,
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: ".12em", color: "var(--tk-text-muted)", fontWeight: 500, textTransform: "uppercase", marginBottom: 2 }}>
            Company
          </div>
          {company.name || "—"}
        </div>
      </div>

      {/* Vertical connector */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ width: 2, height: 18, background: "var(--tk-border)" }} />
      </div>

      {/* Tier bands */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activeTiers.map((tier, tierIndex) => (
          <div key={tier.key}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 8,
                paddingLeft: 4,
              }}
            >
              <div
                style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: tier.color,
                }}
              />
              <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--tk-text-muted)", fontWeight: 600 }}>
                {tier.label}
              </div>
              <div style={{ flex: 1, height: 1, background: "var(--tk-border)" }} />
              <div style={{ fontSize: 11, color: "var(--tk-text-muted)", fontFamily: "var(--tk-font-mono, monospace)" }}>
                {byTier[tier.key].length}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                gap: 10,
                paddingLeft: 20,
                borderLeft: `2px solid ${tier.color}22`,
              }}
            >
              {byTier[tier.key].map((c) => (
                <HierarchyNode key={c.id} contact={c} accent={tier.color} />
              ))}
            </div>

            {tierIndex < activeTiers.length - 1 && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                <div style={{ width: 2, height: 14, background: "var(--tk-border)" }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HierarchyNode({
  contact,
  accent,
}: {
  contact: CompanyContactRow & { _tier: Tier; _fn: string };
  accent: string;
}) {
  const name = `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.full_name || "—";
  const initials = ((contact.first_name?.[0] || "") + (contact.last_name?.[0] || "")).toUpperCase() || "·";
  const isKey = (contact.key_contact || []).length > 0;

  return (
    <Link
      href={`/contacts/${contact.id}`}
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 12px",
        border: `1px solid ${isKey ? accent : "var(--tk-border)"}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        background: "white",
        textDecoration: "none",
        color: "var(--tk-text)",
        alignItems: "flex-start",
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 30, height: 30, borderRadius: "50%",
          background: accent, color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 600, flexShrink: 0,
        }}
      >
        {initials}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </div>
        <div style={{ fontSize: 11, color: "var(--tk-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {contact.job_title || "—"}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {isKey && (contact.key_contact || []).slice(0, 1).map((k) => (
            <Badge key={k} tone="accent">{k}</Badge>
          ))}
          {contact.emails_opened ? (
            <span style={{ fontSize: 10, color: "var(--tk-text-muted)", fontFamily: "var(--tk-font-mono, monospace)" }}>
              {contact.emails_opened}o
            </span>
          ) : null}
          {contact.emails_replied ? (
            <span style={{ fontSize: 10, color: accent, fontFamily: "var(--tk-font-mono, monospace)", fontWeight: 600 }}>
              {contact.emails_replied}r
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

// --- Right-column pieces ------------------------------------------------

function FunctionSummary({
  contacts,
}: {
  contacts: (CompanyContactRow & { _fn: string })[];
}) {
  const byFn: Record<string, number> = {};
  contacts.forEach((c) => { byFn[c._fn] = (byFn[c._fn] || 0) + 1; });
  const rows = Object.entries(byFn).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return <Placeholder text="No contacts to analyze." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map(([fn, count]) => (
        <div key={fn} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>{fn}</span>
          <span style={{ color: "var(--tk-text-muted)", fontFamily: "var(--tk-font-mono, monospace)" }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

function KeyContactList({
  contacts,
}: {
  contacts: (CompanyContactRow & { _tier: Tier; _fn: string })[];
}) {
  const keys = contacts.filter((c) => (c.key_contact || []).length > 0);
  if (keys.length === 0) return <Placeholder text="No key contacts flagged." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {keys.map((c) => (
        <Link
          key={c.id}
          href={`/contacts/${c.id}`}
          style={{
            display: "flex",
            gap: 10,
            padding: "8px 10px",
            border: "1px solid var(--tk-border)",
            borderLeft: `3px solid ${c._tier.color}`,
            borderRadius: 6,
            background: "white",
            textDecoration: "none",
            color: "var(--tk-text)",
            fontSize: 13,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {`${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email}
            </div>
            <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>{c.job_title || c._tier.label}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
            {(c.key_contact || []).slice(0, 1).map((k) => (
              <Badge key={k} tone="accent">{k}</Badge>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}

// --- Small bits ---------------------------------------------------------

function TierChip({
  active, onClick, color, label,
}: {
  active: boolean; onClick: () => void; color: string; label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 10px",
        fontSize: 12,
        borderRadius: 999,
        border: `1px solid ${active ? color : "var(--tk-border)"}`,
        background: active ? color : "white",
        color: active ? "white" : "var(--tk-text-secondary)",
        cursor: "pointer",
        fontWeight: active ? 600 : 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {!active && (
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
      )}
      {label}
    </button>
  );
}

function MiniKpi({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      style={{
        padding: "6px 8px",
        borderRadius: 6,
        background: accent && value > 0 ? "rgba(212,255,90,.18)" : "white",
        border: "1px solid var(--tk-border)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--tk-text-muted)", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function PanelCard({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="tk-card" style={{ padding: 18 }}>
      {eyebrow && <div className="tk-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
      <div className="tk-editorial" style={{ fontSize: 18, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "1px dashed var(--tk-border-strong)",
        borderRadius: 8,
        padding: 20,
        color: "var(--tk-text-muted)",
        fontSize: 13,
        textAlign: "center",
        background: "var(--tk-bg-muted)",
      }}
    >
      {text}
    </div>
  );
}

function SummaryList({ items }: { items: [string, string | null | undefined][] }) {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt style={{ fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--tk-text-muted)", fontWeight: 600 }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 13, marginTop: 1 }}>
            {v ? v : <span style={{ color: "var(--tk-text-muted)" }}>—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(iso);
  }
}
