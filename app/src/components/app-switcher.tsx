"use client";

import { useState, useRef, useEffect } from "react";

type AppLink = {
  name: string;
  url: string;
  description: string;
};

const APPS: AppLink[] = [
  { name: "IDN Web Site", url: "https://idn-webiste.pplx.app/", description: "Public IDN marketing site" },
  { name: "Audience List", url: "https://idn-list-campaigns.vercel.app/", description: "Audience database & email campaigns" },
  { name: "IDN News Dashboard", url: "https://tldr-dashboard-rho.vercel.app/#/", description: "TL;DR news roll-up" },
  { name: "IDN Signals", url: "https://www.perplexity.ai/computer/a/22a557b1-0286-4190-bb20-25788a39b1c6", description: "Signal monitoring & triage" },
  { name: "IDN PPC & Clicks", url: "https://www.perplexity.ai/computer/a/713289ae-5292-4e96-87fa-be3a09d9cd11", description: "Paid campaign performance" },
  { name: "IDN Landscapes", url: "https://landscape-cms.vercel.app/", description: "Market landscape CMS" },
  { name: "IDN Design", url: "https://idn-design-review.pplx.app/?s=ai-deployment&f=registration&page=stage1&v=ref-original&w=1200&vr=0", description: "Design review workshop" },
  { name: "IDS MMS", url: "https://idn-mms.vercel.app/dashboard", description: "Media management system" },
];

export function AppSwitcher() {
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
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Switch app"
        aria-label="Switch app"
        aria-expanded={open}
        style={{
          width: 34,
          height: 34,
          padding: 0,
          borderRadius: 8,
          border: "1px solid #374151",
          background: open ? "#1f2937" : "transparent",
          color: "white",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <span style={hamburgerBar} />
        <span style={hamburgerBar} />
        <span style={hamburgerBar} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            background: "white",
            border: "1px solid var(--tk-border)",
            borderRadius: 10,
            boxShadow: "0 10px 40px rgba(0,0,0,.15)",
            padding: 8,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: "8px 12px 10px",
              borderBottom: "1px solid var(--tk-border)",
              marginBottom: 6,
            }}
          >
            <div
              className="tk-eyebrow"
              style={{ fontSize: 10, color: "var(--tk-text-muted)" }}
            >
              IDN Portfolio
            </div>
            <div
              className="tk-editorial"
              style={{ fontSize: 16, color: "var(--tk-text)" }}
            >
              Switch app
            </div>
          </div>
          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            {APPS.map((app) => (
              <a
                key={app.name}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "10px 12px",
                  borderRadius: 6,
                  textDecoration: "none",
                  color: "inherit",
                }}
                className="app-switcher-item"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--tk-text)",
                    }}
                  >
                    {app.name}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--tk-text-muted)",
                    }}
                    aria-hidden
                  >
                    ↗
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--tk-text-muted)",
                    marginTop: 2,
                  }}
                >
                  {app.description}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .app-switcher-item:hover {
          background: var(--tk-bg-muted);
        }
      `}</style>
    </div>
  );
}

const hamburgerBar: React.CSSProperties = {
  display: "block",
  width: 18,
  height: 2,
  borderRadius: 1,
  background: "currentColor",
};
