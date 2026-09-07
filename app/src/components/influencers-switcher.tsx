"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type SpeedLink = {
  label: string;
  href: string;
};

type SubApp = {
  slug: string;
  name: string;
  tagline: string;
  status: "live" | "skeleton" | "planned";
  speedLinks: SpeedLink[];
};

// 5 columns x 1 row:
//   Overview, Event Speakers, Socializers, Evangelists, Open Standards
const ROW_1: SubApp[] = [
  {
    slug: "",
    name: "Overview",
    tagline: "Cross-cohort influencer view",
    status: "skeleton",
    speedLinks: [
      { label: "All influencers", href: "/influencers?tab=all" },
      { label: "Top mentions (30d)", href: "/influencers?tab=mentions" },
      { label: "By topic", href: "/influencers?tab=topics" },
    ],
  },
  {
    slug: "speakers",
    name: "Event Speakers",
    tagline: "Past + prospective summit speakers",
    status: "live",
    speedLinks: [
      { label: "Speaker roster", href: "/influencers/speakers?tab=roster" },
      { label: "Prospects", href: "/influencers/speakers?tab=prospects" },
      { label: "By summit", href: "/influencers/speakers?tab=summit" },
    ],
  },
  {
    slug: "socializers",
    name: "Socializers",
    tagline: "High-reach voices on X and LinkedIn",
    status: "planned",
    speedLinks: [
      { label: "Top reach", href: "/influencers/socializers?tab=reach" },
      { label: "Recent posts", href: "/influencers/socializers?tab=posts" },
      { label: "By platform", href: "/influencers/socializers?tab=platform" },
    ],
  },
  {
    slug: "evangelists",
    name: "Evangelists",
    tagline: "Vendor and platform evangelists",
    status: "planned",
    speedLinks: [
      { label: "By vendor", href: "/influencers/evangelists?tab=vendor" },
      { label: "By platform", href: "/influencers/evangelists?tab=platform" },
      { label: "Recent activity", href: "/influencers/evangelists?tab=activity" },
    ],
  },
  {
    slug: "open-standards",
    name: "Open Standards",
    tagline: "Standards & spec leadership",
    status: "planned",
    speedLinks: [
      { label: "By standard", href: "/influencers/open-standards?tab=standard" },
      { label: "Working groups", href: "/influencers/open-standards?tab=groups" },
      { label: "Spec authors", href: "/influencers/open-standards?tab=authors" },
    ],
  },
];

function statusPill(status: SubApp["status"]) {
  const styles: Record<SubApp["status"], { bg: string; color: string; label: string }> = {
    live: { bg: "#dcfce7", color: "#166534", label: "live" },
    skeleton: { bg: "#fef3c7", color: "#854d0e", label: "skeleton" },
    planned: { bg: "#e5e7eb", color: "#374151", label: "planned" },
  };
  const s = styles[status];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        padding: "2px 7px",
        borderRadius: 999,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

function AppTile({ app, onNavigate }: { app: SubApp; onNavigate: () => void }) {
  const primaryHref = app.slug ? `/influencers/${app.slug}` : "/influencers";
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRight: "1px solid var(--tk-border)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 148,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <Link
          href={primaryHref}
          onClick={onNavigate}
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--tk-text)",
            textDecoration: "none",
            lineHeight: 1.25,
          }}
        >
          {app.name}
        </Link>
        {statusPill(app.status)}
      </div>
      <div style={{ fontSize: 12, color: "var(--tk-text-muted)", lineHeight: 1.35 }}>{app.tagline}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "auto" }}>
        {app.speedLinks.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            onClick={onNavigate}
            style={{
              fontSize: 12,
              color: "var(--tk-text-muted)",
              textDecoration: "none",
              padding: "3px 0",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--tk-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--tk-text-muted)";
            }}
          >
            → {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function InfluencersSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const routeActive = pathname === "/influencers" || pathname.startsWith("/influencers/");

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Influencers sub-apps"
        className={`tk-nav-trigger${open || routeActive ? " active" : ""}`}
      >
        <span>Influencers</span>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 120ms ease",
            fontSize: 9,
            lineHeight: 1,
            marginLeft: 4,
          }}
        >
          ▼
        </span>
      </button>
      <style jsx>{`
        .tk-nav-trigger {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          color: var(--tk-nav-fg, #ffffff);
          font-family: inherit;
          font-weight: 500;
          font-size: 14px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
        }
        .tk-nav-trigger:hover,
        .tk-nav-trigger.active {
          color: var(--tk-lime);
        }
      `}</style>

      {open && (
        <div
          style={{
            position: "fixed",
            top: 62,
            right: "auto",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(1200px, calc(100vw - 24px))",
            background: "white",
            border: "1px solid var(--tk-border)",
            borderRadius: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,.22)",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              padding: "14px 20px 12px",
              borderBottom: "1px solid var(--tk-border)",
              background: "var(--tk-bg-muted)",
            }}
          >
            <div>
              <div
                className="tk-eyebrow"
                style={{ fontSize: 10, color: "var(--tk-text-muted)", letterSpacing: 1 }}
              >
                Influencers
              </div>
              <div className="tk-editorial" style={{ fontSize: 18, color: "var(--tk-text)" }}>
                Speakers, socializers, evangelists & standards leaders
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>
              Overview · Event Speakers · Socializers · Evangelists · Open Standards
            </div>
          </div>

          {/* Row 1 (all 5 columns) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            }}
          >
            {ROW_1.map((app) => (
              <AppTile key={app.name} app={app} onNavigate={() => setOpen(false)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
