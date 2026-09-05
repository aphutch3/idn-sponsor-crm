"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";

type CompanyRow = any;
export type JournalEntry = {
  id: string;
  kind: string;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  actor: string | null;
  source: string | null;
  meta: any;
};

export function RealJournalPanel({
  company,
  entries: initialEntries,
}: {
  company: CompanyRow;
  entries: JournalEntry[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Only include journal-flagged notes AND plain notes (both are "journal" surface)
  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries);
  useEffect(() => setEntries(initialEntries), [initialEntries]);

  const [draft, setDraft] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [posting, setPosting] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  // Collect all tags across entries
  const allTags: { tag: string; count: number }[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const tags: string[] = e.meta?.tags || [];
      for (const t of tags) map.set(t, (map.get(t) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  }, [entries]);

  const pinned = entries.filter((e) => e.meta?.pinned === true);
  const filtered = entries.filter((e) => {
    if (showPinnedOnly && !e.meta?.pinned) return false;
    if (filterTag && !(e.meta?.tags || []).includes(filterTag)) return false;
    return true;
  });

  async function postEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    const tags = draftTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    try {
      const res = await fetch("/api/activities/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: company.id,
          kind: "note",
          subject: draftTitle.trim() || draft.trim().slice(0, 80),
          body: draft.trim(),
          meta: {
            channel: "journal",
            journal: true,
            tags: tags.length > 0 ? tags : undefined,
            pinned: false,
          },
        }),
      });
      if (res.ok) {
        const { activity } = await res.json();
        setEntries((prev) => [activity, ...prev]);
        setDraft("");
        setDraftTitle("");
        setDraftTags("");
        start(() => router.refresh());
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to post");
      }
    } finally {
      setPosting(false);
    }
  }

  async function togglePin(entryId: string, currentlyPinned: boolean) {
    // Optimistic
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, meta: { ...e.meta, pinned: !currentlyPinned } } : e));
    const target = entries.find((e) => e.id === entryId);
    if (!target) return;
    const res = await fetch(`/api/activities/${entryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        patch: {
          meta: { ...(target.meta || {}), pinned: !currentlyPinned },
        },
      }),
    });
    if (!res.ok) {
      // Revert
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, meta: { ...e.meta, pinned: currentlyPinned } } : e));
      alert("Failed to update pin — activity edit API may not be wired yet.");
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      {/* LEFT — feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Composer */}
        <PanelCard title="New entry" eyebrow="Scrapbook · thought · clipping">
          <form onSubmit={postEntry}>
            <input
              placeholder="Title (optional)"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid var(--tk-border)",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 8,
                background: "white",
              }}
            />
            <textarea
              placeholder={`What did you learn or notice about ${company.name}?`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{
                width: "100%",
                minHeight: 110,
                padding: 10,
                border: "1px solid var(--tk-border)",
                borderRadius: 6,
                fontSize: 13,
                fontFamily: "inherit",
                background: "white",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <input
                placeholder="tags, comma-separated"
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                style={{
                  flex: 1,
                  padding: 6,
                  border: "1px solid var(--tk-border)",
                  borderRadius: 6,
                  fontSize: 12,
                  background: "white",
                }}
              />
              <button
                type="submit"
                disabled={posting || !draft.trim()}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "1px solid var(--tk-border-strong)",
                  background: "var(--tk-primary)",
                  color: "white",
                  opacity: posting || !draft.trim() ? 0.5 : 1,
                }}
              >
                {posting ? "Saving…" : "Post entry"}
              </button>
            </div>
          </form>
        </PanelCard>

        {/* Filters */}
        {(allTags.length > 0 || pinned.length > 0) && (
          <PanelCard title="Filters" eyebrow="Narrow the feed">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {pinned.length > 0 && (
                <button
                  onClick={() => setShowPinnedOnly((v) => !v)}
                  style={pillButtonStyle(showPinnedOnly)}
                >
                  📌 Pinned only ({pinned.length})
                </button>
              )}
              {filterTag && (
                <button onClick={() => setFilterTag(null)} style={pillButtonStyle(false)}>
                  clear tag: {filterTag} ×
                </button>
              )}
              {allTags.slice(0, 10).map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  style={pillButtonStyle(filterTag === tag)}
                >
                  {tag} · {count}
                </button>
              ))}
            </div>
          </PanelCard>
        )}

        {/* Feed */}
        <PanelCard title="Journal entries" eyebrow={`${filtered.length} of ${entries.length}`}>
          {filtered.length === 0 ? (
            <EmptyRow>
              {entries.length === 0 ? "No journal entries yet. Start writing above." : "No entries match the current filter."}
            </EmptyRow>
          ) : (
            <div>
              {filtered.map((e) => {
                const isPinned = e.meta?.pinned === true;
                const tags: string[] = e.meta?.tags || [];
                return (
                  <div
                    key={e.id}
                    style={{
                      padding: 14,
                      marginBottom: 10,
                      borderRadius: 8,
                      border: "1px solid " + (isPinned ? "var(--tk-primary)" : "var(--tk-border)"),
                      background: isPinned ? "rgba(212,255,90,.06)" : "white",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {e.subject && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{e.subject}</div>}
                        <div style={{ fontSize: 11, color: "var(--tk-text-muted)", marginBottom: 8 }}>
                          {fmtDate(e.occurred_at)}
                          {e.actor && <> · by {e.actor}</>}
                          {e.source && e.source !== "manual" && <> · via {e.source}</>}
                        </div>
                      </div>
                      <button
                        onClick={() => togglePin(e.id, isPinned)}
                        title={isPinned ? "Unpin" : "Pin"}
                        style={{
                          background: "none",
                          border: "none",
                          fontSize: 16,
                          cursor: "pointer",
                          opacity: isPinned ? 1 : 0.35,
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        📌
                      </button>
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{e.body}</div>
                    {tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                        {tags.map((t) => (
                          <button
                            key={t}
                            onClick={() => setFilterTag(t)}
                            style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "var(--tk-bg-muted)",
                              border: "1px solid var(--tk-border)",
                              color: "var(--tk-text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PanelCard>
      </div>

      {/* RIGHT */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Pinned" eyebrow="Highest signal">
          {pinned.length === 0 ? (
            <EmptyRow>No pinned entries. Click the pushpin on any entry to pin.</EmptyRow>
          ) : (
            <div>
              {pinned.slice(0, 5).map((e) => (
                <div key={e.id} style={{ padding: "8px 0", borderTop: "1px solid var(--tk-border)" }}>
                  {e.subject && <div style={{ fontSize: 12, fontWeight: 600 }}>{e.subject}</div>}
                  <div style={{ fontSize: 11, color: "var(--tk-text-muted)", marginTop: 2, marginBottom: 4 }}>{fmtDate(e.occurred_at)}</div>
                  <div style={{ fontSize: 12, color: "var(--tk-text-secondary)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{e.body}</div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard title="Recent tags" eyebrow="Themes emerging">
          {allTags.length === 0 ? (
            <EmptyRow>Add comma-separated tags to entries to build a theme map.</EmptyRow>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allTags.slice(0, 20).map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: filterTag === tag ? "var(--tk-primary)" : "var(--tk-bg-muted)",
                    color: filterTag === tag ? "white" : "var(--tk-text-primary)",
                    border: "1px solid var(--tk-border)",
                    cursor: "pointer",
                  }}
                >
                  #{tag} · {count}
                </button>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard title="Timeline" eyebrow="Entries by month">
          <TimelineBars entries={entries} />
        </PanelCard>
      </div>
    </div>
  );
}

function TimelineBars({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) return <EmptyRow>No entries to chart.</EmptyRow>;
  // Group by YYYY-MM
  const buckets = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(e.occurred_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  const max = Math.max(...sorted.map(([, n]) => n), 1);
  return (
    <div>
      {sorted.map(([month, n]) => (
        <div key={month} style={{ padding: "5px 0", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span>{month}</span>
            <span style={{ color: "var(--tk-text-muted)" }}>{n}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "var(--tk-bg-muted)", overflow: "hidden" }}>
            <div style={{ width: `${(n / max) * 100}%`, height: "100%", background: "var(--tk-primary)" }} />
          </div>
        </div>
      ))}
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

function pillButtonStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 999,
    background: active ? "var(--tk-primary)" : "white",
    color: active ? "white" : "var(--tk-text-primary)",
    border: "1px solid " + (active ? "var(--tk-primary)" : "var(--tk-border)"),
    cursor: "pointer",
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    const opts: Intl.DateTimeFormatOptions = sameYear
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", year: "numeric" };
    return d.toLocaleString("en-US", opts);
  } catch {
    return iso;
  }
}
