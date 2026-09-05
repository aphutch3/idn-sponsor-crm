"use client";
import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { ContactsPanel as RealContactsPanel } from "./contacts-panel";
import { CompanyEngagementPanel as RealEngagementPanel } from "./engagement-panel";
import { DealFlowPanel as RealDealFlowPanel } from "./dealflow-panel";

// --- Types ---------------------------------------------------------------

export type CompanyRow = {
  id: string;
  name: string | null;
  domain: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  macro_category: string | null;
  subcategory: string | null;
  industry: string | null;
  country_region: string | null;
  sponsor_tier: string | null;
  company_type: string | null;
  startup: boolean | null;
  company_owner: string | null;
  rank_history: string | null;
  summit_interest: string[] | null;
  number_of_employees: number | string | null;
  marketing_budget: number | null;
  annual_revenue: number | null;
  hubspot_record_id: string | null;
  hs_create_date: string | null;
  logo_url?: string | null;
  description?: string | null;
  // Pipeline / deal-flow fields (all live on companies row today)
  rank_stage?: string | null;
  rank_last_year?: number | null;
  rank_frequency?: string | null;
  sponsor_tier_rank?: number | null;
  keep?: string | null;
  stay_on_top?: boolean | null;
  is_customer?: boolean | null;
  total_revenue?: number | null;
  conferences?: string[] | null;
  conference_speaking?: string[] | null;
  activity?: string[] | null;
  blockers_count?: number | null;
};

export type CompanyContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name?: string | null;
  email: string | null;
  job_title: string | null;
  key_contact: string[] | null;
  lead_status: string | null;
  emails_delivered?: number | null;
  emails_opened: number | null;
  emails_clicked: number | null;
  emails_replied: number | null;
  unsubscribed_all_email?: boolean | null;
  last_activity_date?: string | null;
  linkedin_url?: string | null;
  phone?: string | null;
};

export type CompanyActivityRow = {
  id: string;
  kind: string | null;
  subject: string | null;
  body: string | null;
  occurred_at: string | null;
  actor?: string | null;
  source?: string | null;
  meta?: Record<string, any> | null;
};

export type CompanySendRow = {
  id: string;
  contact_id: string | null;
  subject: string | null;
  status: string | null;
  sent_at: string | null;
  opens: number | null;
  clicks: number | null;
};

type Tab = "overview" | "biography" | "contacts" | "engagement" | "dealflow" | "connections" | "journal";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "overview", label: "Overview", hint: "Company dashboard" },
  { key: "biography", label: "Biography", hint: "History, products, financials" },
  { key: "contacts", label: "Contacts", hint: "People & hierarchy" },
  { key: "engagement", label: "Engagement", hint: "Email · X · LinkedIn" },
  { key: "dealflow", label: "Deal Flow", hint: "Pipeline & history" },
  { key: "connections", label: "Connections", hint: "Market & IDN links" },
  { key: "journal", label: "Journal", hint: "Free-form notes" },
];

// --- Root shell ----------------------------------------------------------

export function CompanyShell({
  company,
  contacts,
  activity,
  sends = [],
}: {
  company: CompanyRow;
  contacts: CompanyContactRow[];
  activity: CompanyActivityRow[];
  sends?: CompanySendRow[];
}) {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [collapsedHeader, setCollapsedHeader] = React.useState(false);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const saved = localStorage.getItem("company-shell:left");
    if (saved !== null) setLeftOpen(saved === "1");
  }, []);

  const toggleLeft = () => {
    const next = !leftOpen;
    setLeftOpen(next);
    localStorage.setItem("company-shell:left", next ? "1" : "0");
  };

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setCollapsedHeader(!entries[0].isIntersecting),
      { rootMargin: "-56px 0px 0px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const displayName = company.name || "Unnamed company";

  return (
    <div
      className="tk-shell"
      data-left={leftOpen ? "1" : "0"}
      data-right="1"
      style={{ gridTemplateColumns: leftOpen ? "280px 1fr" : "44px 1fr" }}
    >
      {/* Left rail */}
      <aside className="tk-rail tk-rail-left">
        {leftOpen ? (
          <div className="tk-rail-inner">
            <div style={{ padding: "18px 20px 8px" }}>
              <div className="tk-eyebrow">Company</div>
              <div
                className="tk-editorial"
                style={{ fontSize: 18, marginTop: 6, lineHeight: 1.15, wordBreak: "break-word" }}
              >
                {displayName}
              </div>
              {company.domain && (
                <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 4 }}>{company.domain}</div>
              )}
              {company.sponsor_tier && (
                <div style={{ marginTop: 8 }}>
                  <Badge tone="accent">{company.sponsor_tier}</Badge>
                </div>
              )}
            </div>

            <div className="tk-curriculum-section">
              <h3>View</h3>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`tk-curriculum-lesson ${tab === t.key ? "active" : ""}`}
                  style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}
                >
                  <span className="tk-check" />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span>{t.label}</span>
                    <span style={{ fontSize: 11, color: "var(--tk-text-muted)", fontWeight: 400 }}>{t.hint}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="tk-curriculum-section">
              <h3>Quick actions</h3>
              <button className="tk-curriculum-lesson" style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}>
                <span className="tk-check" />
                <span>Log activity</span>
              </button>
              <button className="tk-curriculum-lesson" style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}>
                <span className="tk-check" />
                <span>Add contact</span>
              </button>
              <button className="tk-curriculum-lesson" style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}>
                <span className="tk-check" />
                <span>Run research agent</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="tk-rail-collapsed"><span>Company</span></div>
        )}
      </aside>
      <button
        type="button"
        aria-label={leftOpen ? "Collapse company navigation" : "Expand company navigation"}
        title={leftOpen ? "Collapse company navigation" : "Expand company navigation"}
        className="tk-collapse-btn tk-collapse-left"
        onClick={toggleLeft}
        style={{ left: leftOpen ? "268px" : "32px" }}
      >
        {leftOpen ? "‹" : "›"}
      </button>

      {/* Main pane */}
      <section className="tk-center" style={{ background: "var(--tk-bg-muted)" }}>
        <div className="tk-center-crumbs">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/companies">Companies</Link>
          <span>/</span>
          <span style={{ color: "var(--tk-text)" }}>{displayName}</span>
        </div>

        <div ref={sentinelRef} style={{ height: 1 }} />

        <StickyDashboardHeader
          company={company}
          contacts={contacts}
          activity={activity}
          sends={sends}
          collapsed={collapsedHeader}
          tab={tab}
        />

        <div style={{ padding: "24px 32px 40px" }}>
          {tab === "overview" && <OverviewPanel company={company} contacts={contacts} activity={activity} />}
          {tab === "biography" && <BiographyPanel company={company} />}
          {tab === "contacts" && <RealContactsPanel company={company} contacts={contacts} />}
          {tab === "engagement" && <RealEngagementPanel company={company} contacts={contacts} activity={activity} sends={sends} />}
          {tab === "dealflow" && <RealDealFlowPanel company={company} contacts={contacts} activity={activity} sends={sends} />}
          {tab === "connections" && <ConnectionsPanel company={company} />}
          {tab === "journal" && <JournalPanel company={company} />}
        </div>
      </section>
    </div>
  );
}

// --- Sticky dashboard header --------------------------------------------

function StickyDashboardHeader({
  company,
  contacts,
  activity,
  sends,
  collapsed,
  tab,
}: {
  company: CompanyRow;
  contacts: CompanyContactRow[];
  activity: CompanyActivityRow[];
  sends: CompanySendRow[];
  collapsed: boolean;
  tab: Tab;
}) {
  const displayName = company.name || "Unnamed company";
  const initials = (displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "·").toUpperCase();
  const tabLabel = TABS.find((t) => t.key === tab)?.label || "";

  return (
    <div
      style={{
        position: "sticky",
        top: "var(--tk-nav-h, 56px)",
        zIndex: 20,
        background: "white",
        borderBottom: "1px solid var(--tk-border)",
        transition: "padding 180ms ease, box-shadow 180ms ease",
        padding: collapsed ? "10px 32px" : "24px 32px",
        boxShadow: collapsed ? "0 2px 12px -8px rgba(15,23,42,0.25)" : "none",
      }}
    >
      {collapsed ? (
        <CollapsedHeader displayName={displayName} company={company} tabLabel={tabLabel} initials={initials} />
      ) : (
        <ExpandedHeader
          displayName={displayName}
          company={company}
          contacts={contacts}
          activity={activity}
          sends={sends}
          initials={initials}
        />
      )}
    </div>
  );
}

function CollapsedHeader({
  displayName,
  company,
  tabLabel,
  initials,
}: {
  displayName: string;
  company: CompanyRow;
  tabLabel: string;
  initials: string;
}) {
  return (
    <div className="flex items-center gap-3" style={{ minHeight: 32 }}>
      <CompanyMark initials={initials} logoUrl={company.logo_url} size={32} />
      <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
      {company.domain && (
        <div style={{ fontSize: 12, color: "var(--tk-text-muted)" }}>· {company.domain}</div>
      )}
      {company.sponsor_tier && <Badge tone="accent">{company.sponsor_tier}</Badge>}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <span className="tk-eyebrow" style={{ fontSize: 10 }}>{tabLabel}</span>
      </div>
    </div>
  );
}

function ExpandedHeader({
  displayName,
  company,
  contacts,
  activity,
  sends,
  initials,
}: {
  displayName: string;
  company: CompanyRow;
  contacts: CompanyContactRow[];
  activity: CompanyActivityRow[];
  sends: CompanySendRow[];
  initials: string;
}) {
  const totalOpens = contacts.reduce((s, c) => s + (c.emails_opened || 0), 0);
  const totalReplies = contacts.reduce((s, c) => s + (c.emails_replied || 0), 0);
  const keyCount = contacts.filter((c) => (c.key_contact || []).length > 0).length;
  const lastTouch = mostRecent(activity.map((a) => a.occurred_at).concat(sends.map((s) => s.sent_at)));

  return (
    <div className="flex items-start gap-5">
      <CompanyMark initials={initials} logoUrl={company.logo_url} size={64} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <h1 className="tk-editorial" style={{ fontSize: 30, margin: 0, lineHeight: 1.1 }}>{displayName}</h1>
          {company.sponsor_tier && <Badge tone="accent">{company.sponsor_tier}</Badge>}
          {company.company_type && <Badge>{company.company_type}</Badge>}
          {company.startup && <Badge tone="warn">Startup</Badge>}
        </div>
        <div style={{ color: "var(--tk-text-secondary)", fontSize: 14, marginTop: 4 }}>
          {[company.industry || company.macro_category, company.subcategory, company.country_region].filter(Boolean).join(" · ") || (
            <span style={{ color: "var(--tk-text-muted)" }}>—</span>
          )}
        </div>

        <div className="flex items-center" style={{ gap: 18, marginTop: 12, flexWrap: "wrap", fontSize: 13 }}>
          {company.website_url && (
            <a href={company.website_url} target="_blank" rel="noreferrer" style={{ color: "var(--tk-teal)" }}>
              {stripUrl(company.website_url)}
            </a>
          )}
          {company.linkedin_url && (
            <a href={company.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "var(--tk-teal)" }}>
              LinkedIn
            </a>
          )}
          {company.twitter_handle && (
            <a
              href={company.twitter_handle.startsWith("http") ? company.twitter_handle : `https://x.com/${company.twitter_handle.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--tk-teal)" }}
            >
              X.com
            </a>
          )}
          {company.company_owner && (
            <span style={{ color: "var(--tk-text-muted)" }}>Owner · {company.company_owner}</span>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 12,
            marginTop: 18,
          }}
        >
          <Kpi label="Contacts" value={fmt(contacts.length)} />
          <Kpi label="Key" value={fmt(keyCount)} accent={keyCount > 0} />
          <Kpi label="Opens" value={fmt(totalOpens)} accent={totalOpens > 0} />
          <Kpi label="Replies" value={fmt(totalReplies)} accent={totalReplies > 0} />
          <Kpi label="Activity" value={fmt(activity.length)} />
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--tk-text-muted)" }}>
          Last touch {lastTouch ? fmtDate(lastTouch) : "—"} · {activity.length} logged activity {activity.length === 1 ? "item" : "items"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        <button className="tk-btn tk-btn-sm tk-btn-primary">Log activity</button>
        <button className="tk-btn tk-btn-sm tk-btn-ghost">Add contact</button>
        <button className="tk-btn tk-btn-sm tk-btn-accent" style={{ color: "#111318" }}>Run agent</button>
      </div>
    </div>
  );
}

// --- Panels (all placeholders until each is deepened) --------------------

function OverviewPanel({
  company,
  contacts,
  activity,
}: {
  company: CompanyRow;
  contacts: CompanyContactRow[];
  activity: CompanyActivityRow[];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Activity log" eyebrow="Company timeline">
          {activity.length === 0 ? (
            <Placeholder text="No activity logged yet." />
          ) : (
            <div>
              {activity.slice(0, 12).map((a) => (
                <div
                  key={a.id}
                  style={{ padding: "10px 0", borderTop: "1px solid var(--tk-border)", display: "flex", gap: 12 }}
                >
                  <div style={{ width: 90, fontSize: 12, color: "var(--tk-text-muted)" }}>{fmtDate(a.occurred_at)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {a.kind || "activity"}: {a.subject || <span style={{ color: "var(--tk-text-muted)" }}>—</span>}
                    </div>
                    {a.body && <div style={{ color: "var(--tk-text-secondary)", fontSize: 13, marginTop: 2 }}>{a.body}</div>}
                    {a.actor && <div style={{ fontSize: 11, color: "var(--tk-text-muted)", marginTop: 2 }}>by {a.actor}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
        <PanelCard title="Tasks" eyebrow="Open · in progress">
          <Placeholder text="Task board lands with the Overview iteration." />
        </PanelCard>
        <PanelCard title="Notes" eyebrow="Freeform">
          <Placeholder text="Company notes editor lands with the Overview iteration." />
        </PanelCard>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Highlights" eyebrow="Roll-up">
          <SummaryList
            items={[
              ["Sponsor tier", company.sponsor_tier],
              ["Company type", company.company_type],
              ["Owner", company.company_owner],
              ["Industry", company.industry],
              ["Country", company.country_region],
              ["Contacts", String(contacts.length)],
            ]}
          />
        </PanelCard>
        <PanelCard title="Summit interest" eyebrow="Where they lean in">
          {(company.summit_interest && company.summit_interest.length > 0) ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {company.summit_interest.map((s) => (
                <Badge key={s} tone="accent">{s}</Badge>
              ))}
            </div>
          ) : (
            <Placeholder text="No summit interest tagged." />
          )}
        </PanelCard>
        <PanelCard title="Next actions" eyebrow="Plan">
          <Placeholder text="Next-action planner lands with the Overview iteration." />
        </PanelCard>
      </div>
    </div>
  );
}

function BiographyPanel({ company }: { company: CompanyRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Company overview" eyebrow="What they do">
          {company.description ? (
            <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--tk-text)" }}>{company.description}</div>
          ) : (
            <Placeholder text="Pulled description will land with the Biography iteration." />
          )}
        </PanelCard>
        <PanelCard title="History" eyebrow="Founded · milestones">
          <Placeholder text="Company history and milestones." />
        </PanelCard>
        <PanelCard title="IDN interaction history" eyebrow="Our relationship arc">
          <Placeholder text="Summit sponsorships, prior deals, and touchpoints across IDN properties." />
        </PanelCard>
        <PanelCard title="Products & services" eyebrow="What they sell">
          <Placeholder text="Product catalog and positioning." />
        </PanelCard>
        <PanelCard title="Financial overview" eyebrow="Revenue · funding · budget">
          <SummaryList
            items={[
              ["Annual revenue", company.annual_revenue ? `$${fmt(company.annual_revenue)}` : null],
              ["Marketing budget", company.marketing_budget ? `$${fmt(company.marketing_budget)}` : null],
              ["Employees", company.number_of_employees ? String(company.number_of_employees) : null],
              ["Startup", company.startup ? "Yes" : "No"],
            ]}
          />
        </PanelCard>
      </div>
      <div>
        <PanelCard title="Firmographics" eyebrow="Snapshot">
          <SummaryList
            items={[
              ["Industry", company.industry],
              ["Macro", company.macro_category],
              ["Subcategory", company.subcategory],
              ["Country", company.country_region],
              ["HubSpot ID", company.hubspot_record_id],
              ["Created", fmtDate(company.hs_create_date)],
            ]}
          />
        </PanelCard>
      </div>
    </div>
  );
}

function ContactsPanel({
  company,
  contacts,
}: {
  company: CompanyRow;
  contacts: CompanyContactRow[];
}) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [sort, setSort] = React.useState<"opens" | "name" | "status">("opens");
  const [filter, setFilter] = React.useState("");

  const filtered = contacts
    .filter((c) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      const name = `${c.first_name || ""} ${c.last_name || ""} ${c.full_name || ""}`.toLowerCase();
      return name.includes(q) || (c.email || "").toLowerCase().includes(q) || (c.job_title || "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "name") return `${a.last_name || ""}`.localeCompare(`${b.last_name || ""}`);
      if (sort === "status") return `${a.lead_status || ""}`.localeCompare(`${b.lead_status || ""}`);
      return (b.emails_opened || 0) - (a.emails_opened || 0);
    });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title={`Contacts · ${contacts.length}`} eyebrow="Sort · filter · expand">
          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="Filter by name, email, title"
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
              {(["opens", "name", "status"] as const).map((s) => (
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

          {filtered.length === 0 ? (
            <Placeholder text={contacts.length === 0 ? "No contacts linked yet." : "No contacts match this filter."} />
          ) : (
            <div style={{ borderTop: "1px solid var(--tk-border)" }}>
              {filtered.map((c) => {
                const isOpen = !!expanded[c.id];
                const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.full_name || c.email || "—";
                return (
                  <div key={c.id} style={{ borderBottom: "1px solid var(--tk-border)" }}>
                    <div
                      onClick={() => setExpanded((prev) => ({ ...prev, [c.id]: !isOpen }))}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "24px 1.5fr 1.5fr 1fr auto",
                        gap: 12,
                        padding: "10px 6px",
                        cursor: "pointer",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ color: "var(--tk-text-muted)", fontSize: 12 }}>{isOpen ? "▾" : "▸"}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                        {c.email && <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>{c.email}</div>}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--tk-text-secondary)" }}>{c.job_title || "—"}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(c.key_contact || []).map((k) => (
                          <Badge key={k} tone="accent">{k}</Badge>
                        ))}
                        {c.lead_status && <Badge>{c.lead_status}</Badge>}
                        {c.unsubscribed_all_email && <Badge tone="danger">Unsub</Badge>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--tk-text-muted)", fontFamily: "var(--tk-font-mono, monospace)" }}>
                        {c.emails_opened || 0} · {c.emails_clicked || 0} · {c.emails_replied || 0}
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ padding: "0 6px 14px 42px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <SummaryList
                          items={[
                            ["Email", c.email],
                            ["Phone", c.phone],
                            ["Title", c.job_title],
                            ["Status", c.lead_status],
                          ]}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                          <Link
                            href={`/contacts/${c.id}`}
                            className="tk-btn tk-btn-sm tk-btn-primary"
                            style={{ textDecoration: "none" }}
                          >
                            Open contact →
                          </Link>
                          {c.linkedin_url && (
                            <a href={c.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--tk-teal)" }}>
                              LinkedIn ↗
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PanelCard>

        <PanelCard title="Hierarchy" eyebrow="Org chart">
          <Placeholder text="Company hierarchy tree with reporting lines lands next." />
        </PanelCard>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Contact graph" eyebrow="Who talks to whom">
          <Placeholder text="Force-directed graph of contacts within this company." />
        </PanelCard>
        <PanelCard title="Coverage" eyebrow="Roles hit / missed">
          <Placeholder text="Which functions we cover vs. gaps." />
        </PanelCard>
      </div>
    </div>
  );
}

function EngagementPanel({
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
  const contactCount = contacts.length;
  const connectedLinkedIn = contacts.filter((c) => c.linkedin_url).length;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Company-wide engagement" eyebrow="Email · X · LinkedIn">
          <Placeholder text="Company-level channel composer + timeline lands next — mirrors the contact Engagement panel with a channel picker." />
        </PanelCard>
        <PanelCard title="Recent sends" eyebrow="Across all contacts">
          {sends.length === 0 ? (
            <Placeholder text="No email sends yet." />
          ) : (
            <div>
              {sends.slice(0, 10).map((s) => (
                <div key={s.id} style={{ padding: "10px 0", borderTop: "1px solid var(--tk-border)", display: "flex", gap: 12 }}>
                  <div style={{ width: 90, fontSize: 12, color: "var(--tk-text-muted)" }}>{fmtDate(s.sent_at)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.subject || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--tk-text-muted)", marginTop: 2 }}>
                      {s.status} · opens {s.opens || 0} · clicks {s.clicks || 0}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Connection status map" eyebrow="Who's connected to whom">
          <SummaryList
            items={[
              ["Total contacts", String(contactCount)],
              ["LinkedIn on file", `${connectedLinkedIn} of ${contactCount}`],
              ["Twitter/X handles", String(contacts.filter((c) => (c as any).twitter_username).length)],
              ["Unsubscribed", String(contacts.filter((c) => c.unsubscribed_all_email).length)],
            ]}
          />
        </PanelCard>
        <PanelCard title="Channel breakdown" eyebrow="Coming next">
          <Placeholder text="Per-channel volume, opens, replies across the company." />
        </PanelCard>
      </div>
    </div>
  );
}

function DealFlowPanel({ company }: { company: CompanyRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Pipeline" eyebrow="Current stage">
          <Placeholder text="Deal pipeline stages, next steps, and forecast." />
        </PanelCard>
        <PanelCard title="Historical business" eyebrow="Past deals">
          <Placeholder text="Prior sponsorships, contracts, and revenue by year." />
        </PanelCard>
      </div>
      <div>
        <PanelCard title="Forecast" eyebrow="Weighted">
          <Placeholder text="Weighted pipeline value + expected close dates." />
        </PanelCard>
      </div>
    </div>
  );
}

function ConnectionsPanel({ company }: { company: CompanyRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Market map" eyebrow="Competes with · connects to">
          <Placeholder text="Competitive landscape and adjacent companies in the same category." />
        </PanelCard>
        <PanelCard title="IDN partnership assets" eyebrow="Inventory of what we've used together">
          <Placeholder text="Branding assets, sponsored properties, and integration inventory." />
        </PanelCard>
        <PanelCard title="Integration & interaction process" eyebrow="How we work together">
          <Placeholder text="Handoffs, tooling touchpoints, and process notes." />
        </PanelCard>
      </div>
      <div>
        <PanelCard title="Partner health" eyebrow="Signal">
          <Placeholder text="Roll-up of partnership health across categories." />
        </PanelCard>
      </div>
    </div>
  );
}

function JournalPanel({ company }: { company: CompanyRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <PanelCard title="Journal entries" eyebrow="Free-form · scrapbook">
        <Placeholder text="Freeform notes, clippings, and captured moments about this company." />
      </PanelCard>
      <PanelCard title="Pinned" eyebrow="Highest signal">
        <Placeholder text="Pinned entries." />
      </PanelCard>
    </div>
  );
}

// --- Bits ---------------------------------------------------------------

function CompanyMark({ initials, logoUrl, size }: { initials: string; logoUrl?: string | null; size: number }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          objectFit: "contain",
          background: "white",
          border: "1px solid var(--tk-border)",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: "var(--tk-primary)",
        color: "white",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--tk-font-serif)",
        fontWeight: 500,
        fontSize: Math.round(size * 0.4),
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: accent ? "rgba(212,255,90,.15)" : "var(--tk-bg-muted)",
        border: "1px solid var(--tk-border)",
      }}
    >
      <div className="tk-eyebrow" style={{ fontSize: 10 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--tk-font-serif)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function PanelCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
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
    <dl style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="tk-eyebrow" style={{ fontSize: 10 }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 13, marginTop: 2 }}>
            {v ? v : <span style={{ color: "var(--tk-text-muted)" }}>—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// --- Utils --------------------------------------------------------------

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString();
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(iso);
  }
}
function mostRecent(dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter(Boolean) as string[];
  if (valid.length === 0) return null;
  return valid.sort().slice(-1)[0];
}
function stripUrl(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
