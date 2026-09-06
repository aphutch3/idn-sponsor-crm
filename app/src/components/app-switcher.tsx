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

// Canonical source of truth for the app list — one JSON, many apps.
// Change /apps.json in this repo and every embedding app updates within ~60s.
const MANIFEST_URL = "https://idn-sponsor-crm.vercel.app/apps.json";
const CACHE_KEY = "idn-apps-manifest-v1";

// Baked-in fallback used on first paint and when the fetch fails.
// Keep in sync with public/apps.json in this repo.
const FALLBACK_GROUPS: Group[] = [
  {
    label: "Sales",
    apps: [
      { name: "IDN CRM", viewUrl: "https://idn-sponsor-crm.vercel.app/", devUrl: dev("a156a188-a9bc-474f-b0c8-59ee574a8b75") },
      { name: "Audience List", viewUrl: "https://idn-list-campaigns.vercel.app/", devUrl: dev("89cb2977-6547-4e4b-81c9-ac75814d3322") },
      { name: "Crunchbase Clone", viewUrl: "https://ai-layers-intelligence.vercel.app/", devUrl: dev("f9140e2e-d11d-42e8-857b-3a95e6b857b2") },
      { name: "Survey Monkey Clone", viewUrl: "https://idn-surveys.vercel.app/", devUrl: dev("39e947f8-0bef-45f2-b555-0fc6cb77a670") },
      { name: "Event Systems", viewUrl: "https://idn-events-app.vercel.app/#/events", devUrl: dev("6ff40b25-548c-4f1a-9ed6-e3f095c16cf4") },
    ],
  },
  {
    label: "Marketing",
    apps: [
      { name: "IDN Web Site", viewUrl: "https://idn-webiste.pplx.app/", devUrl: dev("c8e11cb7-dff4-4580-9c05-15e3fdb59e50") },
      { name: "IDN MMS", viewUrl: "https://idn-mms.vercel.app/dashboard", devUrl: dev("f45e10e1-2e7e-4370-b5a9-34d2e743bf1e") },
      {
        name: "IDN PPC & Clicks",
        viewUrl: "https://www.perplexity.ai/computer/a/713289ae-5292-4e96-87fa-be3a09d9cd11",
        devUrl: dev("88520eff-5e08-4aba-8719-7363c3771ba6"),
      },
      {
        name: "IDN Design",
        viewUrl:
          "https://idn-design-review.pplx.app/?s=ai-deployment&f=registration&page=stage1&v=ref-original&w=1200&vr=0",
        devUrl: dev("b5dc7db9-1327-4491-a52a-581a1957d6e2"),
      },
      {
        name: "IDN Email Builder",
        viewUrl:
          "https://email-builder-v2-git-phase-10a-cx-shell-aphutch3s-projects.vercel.app/dashboard",
        devUrl: dev("24915d56-a47e-4d65-961e-9d091698f07f"),
      },
    ],
  },
  {
    label: "Content",
    apps: [
      { name: "IDN News Dashboard", viewUrl: "https://tldr-dashboard-rho.vercel.app/#/", devUrl: dev("9b1c3389-7cc7-42d6-89e7-cdb117a46dc0") },
      {
        name: "IDN Signals",
        viewUrl: "https://www.perplexity.ai/computer/a/22a557b1-0286-4190-bb20-25788a39b1c6",
        devUrl: dev("f86def04-3f09-4883-84db-8b00feba6419"),
      },
      { name: "Learning Platform", viewUrl: "https://idn-skill-platform.vercel.app/", devUrl: dev("9fcaf1ac-8d95-4e66-82da-0d7aaf01371b") },
      { name: "Infographics", viewUrl: "https://idn-infographics-factory-v2.pplx.app/", devUrl: dev("24988739-5dd1-4ba7-a947-6e5b8cf9178d") },
      { name: "IDN Landscapes", viewUrl: "https://landscape-cms.vercel.app/", devUrl: dev("d670c641-a2aa-46e2-b11c-4a307b196857") },
      { name: "Timeline Panel", viewUrl: "https://tdi-viewer-eight.vercel.app/", devUrl: dev("40af7e8a-afa0-4a68-ba69-24a2ff6e0ff3") },
      { name: "GEO Database", viewUrl: "https://idn-geo-viewer.vercel.app/", devUrl: dev("546d611c-3fe0-40c3-88f3-a2f2681ee7f3") },
    ],
  },
  {
    label: "Research",
    apps: [
      { name: "Living Reports Admin", viewUrl: "https://living-reports.pplx.app/#/", devUrl: dev("6af5fd84-f358-40a4-9d8d-07717b609fc0") },
      { name: "Musk Control Panel", viewUrl: "https://analysis-company-musk.vercel.app/products", devUrl: dev("ebf9f793-1376-4dd3-af8e-9e32fe2ceca3") },
      { name: "PayPal Mafia", viewUrl: "https://paypal-mafia.pplx.app/", devUrl: dev("2bf8d9e5-eb99-49c0-8c7c-849f0d18e5c2") },
    ],
  },
  {
    label: "Control Panels",
    apps: [
      { name: "App Mission Control", viewUrl: "https://mission-control-dusky-six.vercel.app/", devUrl: dev("09a95da6-5951-49a4-97f7-71f17a1e5991") },
      { name: "Supabase Admin", viewUrl: "https://supabase-admin-dashboard-three.vercel.app/", devUrl: dev("68c9becf-b0cb-4e89-bbf7-f321df284c72") },
      { name: "1776 Admin", viewUrl: "https://1776-artifact-inventory.pplx.app/", devUrl: dev("f54aee1d-f721-4f3f-bea6-eddfb33d3737") },
      { name: "Home & Contractors", viewUrl: "https://home-os-gules.vercel.app/", devUrl: dev("9d6b4bcd-d237-4fb8-8807-6e4e6ce6ab50") },
    ],
  },
];

// Perplexity Computer session URL for a given session UUID.
function dev(sessionId: string): string {
  return `https://www.perplexity.ai/computer/tasks/${sessionId}`;
}

export function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = window.localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed?.groups)) return parsed.groups as Group[];
        }
      } catch {
        // ignore
      }
    }
    return FALLBACK_GROUPS;
  });
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data?.groups)) return;
        setGroups(data.groups as Group[]);
        try {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          // ignore quota errors
        }
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
            width: "min(1360px, calc(100vw - 24px))",
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
            {groups.map((group, idx) => (
              <div
                key={group.label}
                style={{
                  padding: "16px 14px",
                  borderRight:
                    idx < groups.length - 1 ? "1px solid var(--tk-border)" : "none",
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
                            style={{ color: "#ffffff", background: "#111318", fontWeight: 900 }}
                          >
                            V
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
                              style={{ color: "#000000", background: "var(--tk-lime)", fontWeight: 900 }}
                            >
                              D
                            </a>
                          ) : (
                            <span
                              className="app-switcher-btn app-switcher-btn-empty"
                              title="No dev session linked yet"
                              aria-label="No dev session"
                              style={{ color: "var(--tk-text-muted)", fontWeight: 900 }}
                            >
                              D
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
          width: 20px;
          height: 20px;
          padding: 0;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          text-decoration: none;
          border: 1px solid transparent;
          transition: all 0.12s ease;
          cursor: pointer;
          white-space: nowrap;
          line-height: 1;
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
          color: #000000;
          background: var(--tk-lime);
          border-color: var(--tk-lime-strong);
          font-weight: 900;
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
