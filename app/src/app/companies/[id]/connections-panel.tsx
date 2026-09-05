"use client";

// Server-side would be cleaner, but keeping this a client component to allow
// interactivity (filter, expand). Data is pre-fetched in page.tsx and passed in.

type CompanyRow = any;

export type PeerCompany = {
  id: string;
  name: string;
  domain: string | null;
  sponsor_tier: string | null;
  industry: string | null;
  summit_interest: string[] | null;
  is_customer: boolean | null;
  keep: string | null;
  overlap: string[]; // reason(s) this peer matched
};

export type IntegrationRow = {
  id: string;
  name: string;
  status: "active" | "pending" | "inactive" | "planned";
  description: string;
  last_updated: string | null;
};

export function RealConnectionsPanel({
  company,
  peers,
  contactCount,
  activityCount,
  keyContactCount,
  hasPipelineData,
}: {
  company: CompanyRow;
  peers: PeerCompany[];
  contactCount: number;
  activityCount: number;
  keyContactCount: number;
  hasPipelineData: boolean;
}) {
  // Group peers by overlap reason
  const summitPeers = peers.filter((p) => p.overlap.some((o) => o.startsWith("summit:")));
  const industryPeers = peers.filter((p) => p.overlap.includes("industry") && !summitPeers.some((s) => s.id === p.id));
  const otherPeers = peers.filter((p) => !summitPeers.some((s) => s.id === p.id) && !industryPeers.some((i) => i.id === p.id));

  // IDN partnership assets — derived from company fields
  const partnershipAssets: { label: string; value: React.ReactNode; kind: string }[] = [];
  if (company.is_customer) partnershipAssets.push({ label: "Customer status", value: "Active customer", kind: "customer" });
  if (company.stay_on_top) partnershipAssets.push({ label: "Priority", value: "Stay-on-top", kind: "priority" });
  if (company.keep === "Keep") partnershipAssets.push({ label: "Retention", value: "Keep", kind: "retention" });
  if (company.rank_stage) partnershipAssets.push({ label: "Pipeline stage", value: `Stage ${company.rank_stage}`, kind: "pipeline" });
  if (company.conferences && company.conferences.length > 0) {
    partnershipAssets.push({ label: "Prior conferences", value: company.conferences.join(", "), kind: "conf" });
  }
  if (company.conference_speaking) partnershipAssets.push({ label: "Speaking engagement", value: company.conference_speaking, kind: "speaking" });
  if (company.summit_interest && company.summit_interest.length > 0) {
    partnershipAssets.push({ label: "Summit tracks", value: company.summit_interest.join(", "), kind: "tracks" });
  }
  if (company.marketing_budget) {
    partnershipAssets.push({ label: "Marketing budget", value: `$${Number(company.marketing_budget).toLocaleString()}`, kind: "budget" });
  }

  // Integration touchpoints (heuristic from public profile)
  const integrations: IntegrationRow[] = [];
  if (company.website_url) integrations.push({ id: "web", name: "Website tracked", status: "active", description: company.website_url, last_updated: null });
  if (company.linkedin_url) integrations.push({ id: "li", name: "LinkedIn presence", status: "active", description: company.linkedin_url, last_updated: null });
  if (company.twitter_handle) integrations.push({ id: "x", name: "X/Twitter presence", status: "active", description: company.twitter_handle, last_updated: null });
  if (company.hubspot_record_id) integrations.push({ id: "hs", name: "HubSpot sync", status: "active", description: `Record ${company.hubspot_record_id}`, last_updated: null });
  if (activityCount > 0) integrations.push({ id: "act", name: "Activity logging", status: "active", description: `${activityCount} events`, last_updated: null });
  else integrations.push({ id: "act", name: "Activity logging", status: "pending", description: "No events yet", last_updated: null });
  if (keyContactCount > 0) integrations.push({ id: "kc", name: "Key-contact tagging", status: "active", description: `${keyContactCount} key contacts`, last_updated: null });
  else integrations.push({ id: "kc", name: "Key-contact tagging", status: "pending", description: "No key contacts tagged", last_updated: null });

  // Partner health score — heuristic
  const health = computeHealth({ company, contactCount, activityCount, keyContactCount, hasPipelineData });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      {/* LEFT COLUMN */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Market map — peers */}
        <PanelCard title="Market map" eyebrow="Competes with · connects to">
          {peers.length === 0 ? (
            <EmptyRow>No peer companies found. Add industry, category, or summit interest to build the map.</EmptyRow>
          ) : (
            <div>
              {summitPeers.length > 0 && (
                <PeerGroup title={`Overlaps summit interest (${summitPeers.length})`} subtitle="Share at least one summit track" peers={summitPeers.slice(0, 12)} highlight />
              )}
              {industryPeers.length > 0 && (
                <PeerGroup title={`Same industry (${industryPeers.length})`} subtitle="Direct industry adjacency" peers={industryPeers.slice(0, 8)} />
              )}
              {otherPeers.length > 0 && (
                <PeerGroup title={`Same category (${otherPeers.length})`} subtitle="Same macro category or subcategory" peers={otherPeers.slice(0, 6)} />
              )}
            </div>
          )}
        </PanelCard>

        {/* IDN partnership assets */}
        <PanelCard title="IDN partnership assets" eyebrow="What we've built together">
          {partnershipAssets.length === 0 ? (
            <EmptyRow>No partnership assets tracked yet. Tag summit tracks, set pipeline stage, or record conference history.</EmptyRow>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {partnershipAssets.map((a) => (
                <div key={a.kind + a.label} style={{ padding: 10, borderRadius: 8, background: "var(--tk-bg-muted)", border: "1px solid var(--tk-border)" }}>
                  <div className="tk-eyebrow" style={{ fontSize: 10 }}>{a.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{a.value}</div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        {/* Integrations */}
        <PanelCard title="Integration & interaction points" eyebrow="Data and touchpoints active">
          <div>
            {integrations.map((i) => (
              <div key={i.id} style={rowStyle}>
                <StatusDot status={i.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{i.name}</div>
                  <div style={{ fontSize: 11, color: "var(--tk-text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.description}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--tk-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{i.status}</div>
              </div>
            ))}
          </div>
        </PanelCard>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Partner health" eyebrow="Composite signal">
          <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
            <div style={{
              display: "inline-block",
              width: 90,
              height: 90,
              borderRadius: "50%",
              background: `conic-gradient(${health.color} ${health.score * 3.6}deg, var(--tk-bg-muted) 0deg)`,
              position: "relative",
            }}>
              <div style={{
                position: "absolute", inset: 8,
                borderRadius: "50%", background: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column",
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--tk-font-serif)", color: health.color }}>{health.score}</div>
                <div style={{ fontSize: 9, color: "var(--tk-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{health.label}</div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--tk-border)", paddingTop: 10 }}>
            {health.signals.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 12 }}>
                <span style={{ color: "var(--tk-text-secondary)" }}>{s.label}</span>
                <span style={{ fontWeight: 600, color: s.pass ? "#16a34a" : "#c2410c" }}>{s.pass ? "✓" : "○"} {s.value}</span>
              </div>
            ))}
          </div>
        </PanelCard>

        <PanelCard title="Overlap heatmap" eyebrow="Categorical fit">
          <OverlapHeatmap company={company} peers={peers} />
        </PanelCard>

        <PanelCard title="Suggested introductions" eyebrow="Warm-transfer candidates">
          {peers.filter((p) => p.is_customer).slice(0, 5).length === 0 ? (
            <EmptyRow>No customer peers in shared tracks to route through.</EmptyRow>
          ) : (
            <div>
              {peers.filter((p) => p.is_customer).slice(0, 5).map((p) => (
                <div key={p.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a href={`/companies/${p.id}`} style={{ fontSize: 13, fontWeight: 500, color: "var(--tk-primary)", textDecoration: "none" }}>{p.name}</a>
                    <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>{p.overlap.join(" · ")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

function PeerGroup({ title, subtitle, peers, highlight }: { title: string; subtitle: string; peers: PeerCompany[]; highlight?: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div className="tk-eyebrow" style={{ fontSize: 10 }}>{title}</div>
        <div style={{ fontSize: 10, color: "var(--tk-text-muted)" }}>{subtitle}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
        {peers.map((p) => (
          <a
            key={p.id}
            href={`/companies/${p.id}`}
            style={{
              display: "block",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid " + (highlight ? "var(--tk-primary)" : "var(--tk-border)"),
              background: highlight ? "rgba(212,255,90,.08)" : "white",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
            <div style={{ fontSize: 10, color: "var(--tk-text-muted)", marginTop: 2 }}>
              {p.industry || p.domain || "—"}
              {p.is_customer && <span style={{ color: "#16a34a", marginLeft: 6 }}>· customer</span>}
              {p.sponsor_tier && <span style={{ marginLeft: 6 }}>· {p.sponsor_tier}</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function OverlapHeatmap({ company, peers }: { company: any; peers: PeerCompany[] }) {
  const tracks: string[] = company.summit_interest || [];
  if (tracks.length === 0) {
    return <EmptyRow>No summit interest tags to compare.</EmptyRow>;
  }

  // For each track, count how many peers also carry it
  const rows = tracks.map((t) => {
    const count = peers.filter((p) => p.summit_interest?.includes(t)).length;
    return { track: t, count };
  });
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div>
      {rows.map((r) => (
        <div key={r.track} style={{ padding: "5px 0", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span>{r.track}</span>
            <span style={{ color: "var(--tk-text-muted)" }}>{r.count} peer{r.count === 1 ? "" : "s"}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "var(--tk-bg-muted)", overflow: "hidden" }}>
            <div style={{ width: `${(r.count / max) * 100}%`, height: "100%", background: "var(--tk-primary)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function computeHealth({
  company,
  contactCount,
  activityCount,
  keyContactCount,
  hasPipelineData,
}: {
  company: any;
  contactCount: number;
  activityCount: number;
  keyContactCount: number;
  hasPipelineData: boolean;
}): { score: number; label: string; color: string; signals: { label: string; value: string; pass: boolean }[] } {
  const signals = [
    { label: "Has contacts", value: contactCount > 0 ? `${contactCount}` : "0", pass: contactCount > 0 },
    { label: "Key contact tagged", value: keyContactCount > 0 ? `${keyContactCount}` : "no", pass: keyContactCount > 0 },
    { label: "Summit tracks set", value: (company.summit_interest?.length ?? 0) > 0 ? `${company.summit_interest.length}` : "no", pass: (company.summit_interest?.length ?? 0) > 0 },
    { label: "Pipeline stage set", value: company.rank_stage || "no", pass: hasPipelineData },
    { label: "Recent activity", value: activityCount > 0 ? `${activityCount}` : "no", pass: activityCount > 0 },
    { label: "Sponsor tier set", value: company.sponsor_tier || "no", pass: !!company.sponsor_tier },
  ];
  const passed = signals.filter((s) => s.pass).length;
  const score = Math.round((passed / signals.length) * 100);
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#f59e0b" : score >= 25 ? "#f97316" : "#c2410c";
  const label = score >= 75 ? "Strong" : score >= 50 ? "Building" : score >= 25 ? "Early" : "Cold";
  return { score, label, color, signals };
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

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      border: "1px dashed var(--tk-border-strong)",
      borderRadius: 8,
      padding: 16,
      color: "var(--tk-text-muted)",
      fontSize: 12,
      textAlign: "center",
    }}>
      {children}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active" ? "#16a34a" :
    status === "pending" ? "#f59e0b" :
    status === "planned" ? "#2563eb" :
    "#94a3b8";
  return <div style={{ width: 8, height: 8, borderRadius: 4, background: color, marginTop: 6, flexShrink: 0 }} />;
}

const rowStyle: React.CSSProperties = {
  padding: "8px 0",
  borderTop: "1px solid var(--tk-border)",
  display: "flex",
  gap: 10,
  alignItems: "center",
};
