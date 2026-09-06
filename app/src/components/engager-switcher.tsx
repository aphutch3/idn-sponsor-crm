"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

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

// 4 columns x 2 rows, per the paste:
//   Row 1: Overview, Campaigner, Email Manager, Builder & Assets
//   Row 2: Social Engager, Surveyor, Ad Manager, Video Channels
const ROW_1: SubApp[] = [
  {
    slug: "",
    name: "Overview",
    tagline: "Cross-channel dashboard",
    status: "skeleton",
    speedLinks: [
      { label: "Live campaigns", href: "/engager?tab=live" },
      { label: "Last 30 days", href: "/engager?tab=30d" },
      { label: "Channel mix", href: "/engager?tab=channels" },
    ],
  },
  {
    slug: "campaigner",
    name: "Campaigner",
    tagline: "Plan multi-channel plays",
    status: "planned",
    speedLinks: [
      { label: "New campaign", href: "/engager/campaigner/new" },
      { label: "Active plans", href: "/engager/campaigner?tab=active" },
      { label: "Templates", href: "/engager/campaigner?tab=templates" },
    ],
  },
  {
    slug: "email",
    name: "Email Manager",
    tagline: "Resend campaigns & audience",
    status: "skeleton",
    speedLinks: [
      { label: "New email", href: "/engager/email/new" },
      { label: "All campaigns", href: "/engager/email" },
      { label: "Segments", href: "/segments" },
    ],
  },
  {
    slug: "builder",
    name: "Builder & Assets",
    tagline: "Pages + emails + brand inventory",
    status: "planned",
    speedLinks: [
      { label: "New landing page", href: "/engager/builder/landing" },
      { label: "Brand kit", href: "/engager/builder/brand" },
      { label: "Content library", href: "/engager/builder/content" },
    ],
  },
];

const ROW_2: SubApp[] = [
  {
    slug: "social",
    name: "Social Engager",
    tagline: "X, LinkedIn, YouTube reach",
    status: "planned",
    speedLinks: [
      { label: "New post", href: "/engager/social/new" },
      { label: "Schedule", href: "/engager/social?tab=schedule" },
      { label: "Mentions & replies", href: "/engager/social?tab=inbox" },
    ],
  },
  {
    slug: "surveyor",
    name: "Surveyor",
    tagline: "Sponsor & attendee surveys",
    status: "planned",
    speedLinks: [
      { label: "New survey", href: "/engager/surveyor/new" },
      { label: "Live surveys", href: "/engager/surveyor?tab=live" },
      { label: "Response library", href: "/engager/surveyor?tab=responses" },
    ],
  },
  {
    slug: "ads",
    name: "Ad Manager",
    tagline: "Our ads + sponsor placements",
    status: "planned",
    speedLinks: [
      { label: "Our campaigns", href: "/engager/ads?tab=ours" },
      { label: "Sponsor placements", href: "/engager/ads?tab=sponsor" },
      { label: "Creative library", href: "/engager/ads?tab=creative" },
    ],
  },
  {
    slug: "video",
    name: "Video Channels",
    tagline: "Summit → YouTube pipeline",
    status: "planned",
    speedLinks: [
      { label: "Summit sessions", href: "/engager/video?tab=summit" },
      { label: "YouTube publish", href: "/engager/video?tab=youtube" },
      { label: "Clip queue", href: "/engager/video?tab=clips" },
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
  const primaryHref = app.slug ? `/engager/${app.slug}` : "/engager";
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
              borderTop: "1px dashed transparent",
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

export function EngagerSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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
        aria-label="Engager sub-apps"
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span>Engager</span>
        <span
          style={{
            display: "inline-block",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 120ms ease",
            fontSize: 9,
            lineHeight: 1,
          }}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            top: 62,
            right: "auto",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(1080px, calc(100vw - 24px))",
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
                The Engager
              </div>
              <div className="tk-editorial" style={{ fontSize: 18, color: "var(--tk-text)" }}>
                Multi-channel engagement suite
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>
              Overview · Campaigner · Email · Builder & Assets · Social · Surveyor · Ads · Video
            </div>
          </div>

          {/* Row 1 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            }}
          >
            {ROW_1.map((app) => (
              <AppTile key={app.name} app={app} onNavigate={() => setOpen(false)} />
            ))}
          </div>

          {/* Thin divider */}
          <div style={{ height: 1, background: "var(--tk-border)" }} />

          {/* Row 2 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            }}
          >
            {ROW_2.map((app) => (
              <AppTile key={app.name} app={app} onNavigate={() => setOpen(false)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
