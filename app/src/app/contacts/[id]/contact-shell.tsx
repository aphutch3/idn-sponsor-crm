"use client";
import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";

// --- Types ---------------------------------------------------------------

export type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  twitter_username: string | null;
  company_id: string | null;
  contact_owner: string | null;
  lead_status: string | null;
  key_contact: string[] | null;
  focus: string | null;
  times_contacted: number | null;
  emails_delivered: number | null;
  emails_opened: number | null;
  emails_clicked: number | null;
  emails_replied: number | null;
  emails_bounced: number | null;
  last_email_send_date: string | null;
  last_email_open_date: string | null;
  last_email_click_date: string | null;
  last_email_reply_date: string | null;
  last_activity_date: string | null;
  country_region: string | null;
};

export type CompanyStub = {
  id: string;
  name: string | null;
  domain: string | null;
  sponsor_tier: string | null;
  macro_category: string | null;
} | null;

export type ActivityRow = {
  id: string;
  kind: string | null;
  subject: string | null;
  body: string | null;
  occurred_at: string | null;
};

type Tab = "overview" | "biography" | "engagement" | "connections" | "journal";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "overview", label: "Overview", hint: "Dashboard" },
  { key: "biography", label: "Biography", hint: "Résumé & interests" },
  { key: "engagement", label: "Engagement", hint: "Email, X, LinkedIn" },
  { key: "connections", label: "Connections", hint: "Network graph" },
  { key: "journal", label: "Journal", hint: "Notes & memories" },
];

// --- Root shell ----------------------------------------------------------

export function ContactShell({
  contact,
  company,
  activity,
}: {
  contact: ContactRow;
  company: CompanyStub;
  activity: ActivityRow[];
}) {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [collapsedHeader, setCollapsedHeader] = React.useState(false);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const saved = localStorage.getItem("contact-shell:left");
    if (saved !== null) setLeftOpen(saved === "1");
  }, []);

  const toggleLeft = () => {
    const next = !leftOpen;
    setLeftOpen(next);
    localStorage.setItem("contact-shell:left", next ? "1" : "0");
  };

  // Shrink the dashboard header once we scroll past the sentinel.
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setCollapsedHeader(!entries[0].isIntersecting),
      { rootMargin: "-56px 0px 0px 0px", threshold: 0 } // account for top nav height
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const displayName = contact.full_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Unnamed contact";

  return (
    <div
      className="tk-shell"
      data-left={leftOpen ? "1" : "0"}
      data-right="1"
      style={{ gridTemplateColumns: leftOpen ? "280px 1fr" : "44px 1fr" }}
    >
      {/* Left rail: contact tabs */}
      <aside className="tk-rail tk-rail-left">
        {leftOpen ? (
          <div className="tk-rail-inner">
            <div style={{ padding: "18px 20px 8px" }}>
              <div className="tk-eyebrow">Contact</div>
              <div
                className="tk-editorial"
                style={{ fontSize: 18, marginTop: 6, lineHeight: 1.15, wordBreak: "break-word" }}
              >
                {displayName}
              </div>
              {contact.job_title && (
                <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 4 }}>{contact.job_title}</div>
              )}
              {company && (
                <Link
                  href={`/companies/${company.id}`}
                  style={{ fontSize: 12, color: "var(--tk-teal)", display: "block", marginTop: 6 }}
                >
                  {company.name} →
                </Link>
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
                <span>Send email</span>
              </button>
              <button className="tk-curriculum-lesson" style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}>
                <span className="tk-check" />
                <span>Run research agent</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="tk-rail-collapsed"><span>Contact</span></div>
        )}
      </aside>
      <button
        type="button"
        aria-label={leftOpen ? "Collapse contact navigation" : "Expand contact navigation"}
        title={leftOpen ? "Collapse contact navigation" : "Expand contact navigation"}
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
          <Link href="/contacts">Contacts</Link>
          <span>/</span>
          <span style={{ color: "var(--tk-text)" }}>{displayName}</span>
        </div>

        {/* Sentinel just below crumbs so IntersectionObserver flips at the right moment */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        {/* Sticky shrinking header */}
        <StickyDashboardHeader
          contact={contact}
          company={company}
          activity={activity}
          collapsed={collapsedHeader}
          tab={tab}
        />

        <div style={{ padding: "24px 32px 40px" }}>
          {tab === "overview" && <OverviewPanel contact={contact} activity={activity} />}
          {tab === "biography" && <BiographyPanel contact={contact} />}
          {tab === "engagement" && <EngagementPanel contact={contact} />}
          {tab === "connections" && <ConnectionsPanel contact={contact} company={company} />}
          {tab === "journal" && <JournalPanel contact={contact} />}
        </div>
      </section>
    </div>
  );
}

// --- Sticky dashboard header --------------------------------------------

function StickyDashboardHeader({
  contact,
  company,
  activity,
  collapsed,
  tab,
}: {
  contact: ContactRow;
  company: CompanyStub;
  activity: ActivityRow[];
  collapsed: boolean;
  tab: Tab;
}) {
  const displayName =
    contact.full_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Unnamed contact";
  const initials = ((contact.first_name?.[0] || "") + (contact.last_name?.[0] || "")).toUpperCase() || "·";
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
        <CollapsedHeader
          displayName={displayName}
          contact={contact}
          company={company}
          tabLabel={tabLabel}
          initials={initials}
        />
      ) : (
        <ExpandedHeader
          displayName={displayName}
          contact={contact}
          company={company}
          activity={activity}
          initials={initials}
        />
      )}
    </div>
  );
}

function CollapsedHeader({
  displayName,
  contact,
  company,
  tabLabel,
  initials,
}: {
  displayName: string;
  contact: ContactRow;
  company: CompanyStub;
  tabLabel: string;
  initials: string;
}) {
  return (
    <div className="flex items-center gap-3" style={{ minHeight: 32 }}>
      <Avatar initials={initials} size={32} />
      <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
      {contact.job_title && (
        <div style={{ fontSize: 12, color: "var(--tk-text-muted)" }}>· {contact.job_title}</div>
      )}
      {company && (
        <Link
          href={`/companies/${company.id}`}
          style={{ fontSize: 12, color: "var(--tk-teal)" }}
        >
          {company.name}
        </Link>
      )}
      {contact.key_contact && contact.key_contact.length > 0 && <Badge tone="accent">Key</Badge>}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <span className="tk-eyebrow" style={{ fontSize: 10 }}>{tabLabel}</span>
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="tk-btn tk-btn-sm tk-btn-primary">
            Email
          </a>
        )}
      </div>
    </div>
  );
}

function ExpandedHeader({
  displayName,
  contact,
  company,
  activity,
  initials,
}: {
  displayName: string;
  contact: ContactRow;
  company: CompanyStub;
  activity: ActivityRow[];
  initials: string;
}) {
  const lastTouch = mostRecent([
    contact.last_activity_date,
    contact.last_email_send_date,
    contact.last_email_open_date,
    contact.last_email_click_date,
    contact.last_email_reply_date,
  ]);

  return (
    <div className="flex items-start gap-5">
      <Avatar initials={initials} size={64} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <h1 className="tk-editorial" style={{ fontSize: 30, margin: 0, lineHeight: 1.1 }}>{displayName}</h1>
          {contact.key_contact && contact.key_contact.length > 0 && <Badge tone="accent">Key contact</Badge>}
          {contact.lead_status && <Badge>{contact.lead_status}</Badge>}
        </div>
        <div style={{ color: "var(--tk-text-secondary)", fontSize: 14, marginTop: 4 }}>
          {contact.job_title || <span style={{ color: "var(--tk-text-muted)" }}>—</span>}
          {company && (
            <>
              {" · "}
              <Link href={`/companies/${company.id}`} style={{ color: "var(--tk-teal)" }}>
                {company.name}
              </Link>
              {company.sponsor_tier && (
                <span style={{ color: "var(--tk-text-muted)" }}> · {company.sponsor_tier}</span>
              )}
            </>
          )}
        </div>

        {/* Contact rail */}
        <div className="flex items-center" style={{ gap: 18, marginTop: 12, flexWrap: "wrap", fontSize: 13 }}>
          {contact.email && (
            <a href={`mailto:${contact.email}`} style={{ color: "var(--tk-teal)" }}>
              {contact.email}
            </a>
          )}
          {contact.phone && <span style={{ color: "var(--tk-text-secondary)" }}>{contact.phone}</span>}
          {contact.linkedin_url && (
            <a href={contact.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "var(--tk-teal)" }}>
              LinkedIn
            </a>
          )}
          {contact.twitter_username && (
            <a
              href={`https://x.com/${contact.twitter_username.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--tk-teal)" }}
            >
              @{contact.twitter_username.replace(/^@/, "")}
            </a>
          )}
          {contact.country_region && (
            <span style={{ color: "var(--tk-text-muted)" }}>{contact.country_region}</span>
          )}
        </div>

        {/* KPI strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 12,
            marginTop: 18,
          }}
        >
          <Kpi label="Touches" value={fmt(contact.times_contacted)} />
          <Kpi label="Delivered" value={fmt(contact.emails_delivered)} />
          <Kpi label="Opens" value={fmt(contact.emails_opened)} accent={!!contact.emails_opened} />
          <Kpi label="Clicks" value={fmt(contact.emails_clicked)} accent={!!contact.emails_clicked} />
          <Kpi label="Replies" value={fmt(contact.emails_replied)} accent={!!contact.emails_replied} />
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--tk-text-muted)" }}>
          Last touch {lastTouch ? fmtDate(lastTouch) : "—"} · {activity.length} logged activity {activity.length === 1 ? "item" : "items"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="tk-btn tk-btn-sm tk-btn-primary">
            Send email
          </a>
        )}
        <button className="tk-btn tk-btn-sm tk-btn-ghost">Log activity</button>
        <button className="tk-btn tk-btn-sm tk-btn-accent" style={{ color: "#111318" }}>Run agent</button>
      </div>
    </div>
  );
}

// --- Panels (placeholders for the next iteration) ------------------------

function OverviewPanel({ contact, activity }: { contact: ContactRow; activity: ActivityRow[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Activity history" eyebrow="Log">
          {activity.length === 0 ? (
            <Placeholder text="No activity logged yet." />
          ) : (
            <div>
              {activity.slice(0, 10).map((a) => (
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
        <PanelCard title="Notes" eyebrow="Freeform">
          <Placeholder text="Notes editor lands with the Overview iteration." />
        </PanelCard>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Next actions" eyebrow="Plan">
          <Placeholder text="Next-action planner lands with the Overview iteration." />
        </PanelCard>
        <PanelCard title="Summary" eyebrow="Roll-up">
          <SummaryList
            items={[
              ["Focus", contact.focus],
              ["Lead status", contact.lead_status],
              ["Owner", contact.contact_owner],
              ["Country", contact.country_region],
            ]}
          />
        </PanelCard>
      </div>
    </div>
  );
}

function BiographyPanel({ contact }: { contact: ContactRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="LinkedIn snapshot" eyebrow="Résumé">
          <Placeholder text="LinkedIn scrape + parsed résumé arrive with the Biography iteration." />
        </PanelCard>
        <PanelCard title="Speaking history" eyebrow="Where & what">
          <Placeholder text="Talks, panels, and podcasts." />
        </PanelCard>
        <PanelCard title="Written works" eyebrow="Books · blogs · papers">
          <Placeholder text="Written works catalog." />
        </PanelCard>
        <PanelCard title="Bookmarked social posts" eyebrow="Signals">
          <Placeholder text="Saved posts from X and LinkedIn." />
        </PanelCard>
      </div>
      <div>
        <PanelCard title="Interests" eyebrow="Family · friends · hobbies">
          <Placeholder text="Personal-context capture." />
        </PanelCard>
      </div>
    </div>
  );
}

function EngagementPanel({ contact }: { contact: ContactRow }) {
  const channels = [
    { key: "email", label: "Email", hint: contact.email || "—" },
    { key: "x", label: "X.com", hint: contact.twitter_username || "—" },
    { key: "linkedin", label: "LinkedIn", hint: contact.linkedin_url ? "connected" : "—" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
      {channels.map((c) => (
        <PanelCard key={c.key} title={c.label} eyebrow="Channel">
          <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginBottom: 8 }}>{c.hint}</div>
          <Placeholder text={`${c.label} composer + tracked history land with the Engagement iteration.`} />
        </PanelCard>
      ))}
    </div>
  );
}

function ConnectionsPanel({ contact, company }: { contact: ContactRow; company: CompanyStub }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <PanelCard title="Network graph" eyebrow="Visual">
        <Placeholder text="Force-directed graph of colleagues, coauthors, and shared attendees." />
      </PanelCard>
      <PanelCard title="Hierarchy" eyebrow="Detail on selected node">
        <Placeholder text={company ? `Anchored on ${company.name}.` : "Select a node to see its detail."} />
      </PanelCard>
    </div>
  );
}

function JournalPanel({ contact }: { contact: ContactRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <PanelCard title="Journal entries" eyebrow="Human + agent">
        <Placeholder text="Timeline of important items, memories, and thoughts." />
      </PanelCard>
      <PanelCard title="Pinned memories" eyebrow="Curated">
        <Placeholder text="Anchor the highest-signal moments here." />
      </PanelCard>
    </div>
  );
}

// --- Bits ---------------------------------------------------------------

function Avatar({ initials, size }: { initials: string; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--tk-primary)",
        color: "white",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--tk-font-serif)",
        fontWeight: 500,
        fontSize: Math.round(size * 0.42),
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
