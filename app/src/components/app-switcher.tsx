"use client";

import { useState, useRef, useEffect } from "react";

type AppLink = {
  name: string;
  viewUrl: string;
  devUrl?: string; // Perplexity Computer session where it's being developed
};

type Group = {
  label: string;
  apps: AppLink[];
};

// Portfolio nav. `devUrl` is the Perplexity session where the app is being built.
// Fill these in when you send me the session links.
const GROUPS: Group[] = [
  {
    label: "Sales",
    apps: [
      { name: "IDN CRM", viewUrl: "https://idn-sponsor-crm.vercel.app/" },
      { name: "Audience List", viewUrl: "https://idn-list-campaigns.vercel.app/" },
      { name: "Crunchbase Clone", viewUrl: "https://ai-layers-intelligence.vercel.app/" },
      { name: "Survey Monkey Clone", viewUrl: "https://idn-surveys.vercel.app/" },
    ],
  },
  {
    label: "Marketing",
    apps: [
      { name: "IDN Web Site", viewUrl: "https://idn-webiste.pplx.app/" },
      { name: "IDN MMS", viewUrl: "https://idn-mms.vercel.app/dashboard" },
      {
        name: "IDN PPC & Clicks",
        viewUrl: "https://www.perplexity.ai/computer/a/713289ae-5292-4e96-87fa-be3a09d9cd11",
      },
      {
        name: "IDN Design",
        viewUrl:
          "https://idn-design-review.pplx.app/?s=ai-deployment&f=registration&page=stage1&v=ref-original&w=1200&vr=0",
      },
      {
        name: "IDN Email Builder",
        viewUrl:
          "https://email-builder-v2-git-phase-10a-cx-shell-aphutch3s-projects.vercel.app/dashboard",
      },
    ],
  },
  {
    label: "Content",
    apps: [
      { name: "IDN News Dashboard", viewUrl: "https://tldr-dashboard-rho.vercel.app/#/" },
      {
        name: "IDN Signals",
        viewUrl: "https://www.perplexity.ai/computer/a/22a557b1-0286-4190-bb20-25788a39b1c6",
      },
      { name: "Learning Platform", viewUrl: "https://idn-skill-platform.vercel.app/" },
      { name: "Infographics", viewUrl: "https://idn-infographics-factory-v2.pplx.app/" },
      { name: "IDN Landscapes", viewUrl: "https://landscape-cms.vercel.app/" },
      { name: "Timeline Panel", viewUrl: "https://tdi-viewer-eight.vercel.app/" },
      { name: "GEO Database", viewUrl: "https://idn-geo-viewer.vercel.app/" },
    ],
  },
  {
    label: "Research",
    apps: [
      { name: "Living Reports Admin", viewUrl: "https://living-reports.pplx.app/#/" },
      { name: "Musk Control Panel", viewUrl: "https://analysis-company-musk.vercel.app/products" },
      { name: "PayPal Mafia", viewUrl: "https://paypal-mafia.pplx.app/" },
    ],
  },
  {
    label: "Control Panels",
    apps: [
      { name: "App Mission Control", viewUrl: "https://mission-control-dusky-six.vercel.app/" },
      { name: "Supabase Admin", viewUrl: "https://supabase-admin-dashboard-three.vercel.app/" },
      { name: "1776 Admin", viewUrl: "https://1776-artifact-inventory.pplx.app/" },
      { name: "Home & Contractors", viewUrl: "https://home-os-gules.vercel.app/" },
    ],
  },
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
        title="Portfolio nav"
        aria-label="Portfolio nav"
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
            position: "fixed",
            top: 62,
            right: 12,
            width: "min(1180px, calc(100vw - 24px))",
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
                IDN Portfolio
              </div>
              <div className="tk-editorial" style={{ fontSize: 18, color: "var(--tk-text)" }}>
                Apps, content & reports
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>
              View app · jump to dev session
            </div>
          </div>

          {/* 5-column grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 0,
            }}
          >
            {GROUPS.map((group, idx) => (
              <div
                key={group.label}
                style={{
                  padding: "16px 14px",
                  borderRight:
                    idx < GROUPS.length - 1 ? "1px solid var(--tk-border)" : "none",
                  minWidth: 0,
                }}
              >
                <div
                  className="tk-eyebrow"
                  style={{
                    fontSize: 10,
                    color: "var(--tk-text-muted)",
                    letterSpacing: 1.2,
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--tk-border)",
                  }}
                >
                  {group.label}
                </div>

                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {group.apps.map((app) => (
                    <li key={app.name} className="app-switcher-row">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 6,
                          padding: "6px 8px",
                          borderRadius: 6,
                          minWidth: 0,
                        }}
                      >
                        <a
                          href={app.viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setOpen(false)}
                          title={`View ${app.name}`}
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--tk-text)",
                            textDecoration: "none",
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {app.name}
                        </a>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <a
                            href={app.viewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setOpen(false)}
                            title={`Open ${app.name}`}
                            aria-label={`Open ${app.name}`}
                            className="app-switcher-btn app-switcher-btn-view"
                          >
                            View
                          </a>
                          {app.devUrl ? (
                            <a
                              href={app.devUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setOpen(false)}
                              title={`Continue building ${app.name}`}
                              aria-label={`Continue building ${app.name}`}
                              className="app-switcher-btn app-switcher-btn-dev"
                            >
                              Dev
                            </a>
                          ) : (
                            <span
                              className="app-switcher-btn app-switcher-btn-empty"
                              title="No dev session linked yet"
                              aria-label="No dev session"
                            >
                              Dev
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .app-switcher-row > div:hover {
          background: var(--tk-bg-muted);
        }
        :global(.app-switcher-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 22px;
          padding: 0 8px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          text-decoration: none;
          border: 1px solid transparent;
          transition: all 0.12s ease;
          cursor: pointer;
          white-space: nowrap;
        }
        :global(.app-switcher-btn-view) {
          color: #ffffff;
          background: #111318;
          border-color: #111318;
        }
        :global(.app-switcher-btn-view:hover) {
          background: #1f2937;
          border-color: #1f2937;
        }
        :global(.app-switcher-btn-dev) {
          color: #111318;
          background: var(--tk-lime);
          border-color: var(--tk-lime-strong);
        }
        :global(.app-switcher-btn-dev:hover) {
          background: var(--tk-lime-strong);
        }
        :global(.app-switcher-btn-empty) {
          color: var(--tk-text-muted);
          background: transparent;
          border-color: var(--tk-border);
          cursor: not-allowed;
          opacity: 0.55;
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
