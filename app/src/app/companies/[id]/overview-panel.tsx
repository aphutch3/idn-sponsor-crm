"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

// ---- Types (kept local, structural) ------------------------------------

type CompanyRow = any;
type ActivityRow = {
  id: string;
  kind: string;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  actor: string | null;
  source: string | null;
  meta: any;
};
type ContactRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  key_contact: string[] | null;
};
export type TaskItem = {
  id: string;
  title: string;
  detail: string | null;
  status: "open" | "in_progress" | "waiting" | "done" | "cancelled";
  due_at: string | null;
  assigned_to: string | null;
  origin: string | null;
  meta: any;
  created_at: string;
  updated_at: string;
};
type AgentRunRow = {
  id: string;
  kind: string;
  status: string;
  model: string | null;
  started_at: string;
  finished_at: string | null;
  input: any;
  output: any;
  error: string | null;
};

export function RealOverviewPanel({
  company,
  contacts,
  activity,
  tasks,
  agentRuns,
}: {
  company: CompanyRow;
  contacts: ContactRow[];
  activity: ActivityRow[];
  tasks: TaskItem[];
  agentRuns: AgentRunRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Local optimistic task list
  const [taskList, setTaskList] = useState<TaskItem[]>(tasks);
  useEffect(() => setTaskList(tasks), [tasks]);

  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [creating, setCreating] = useState(false);

  const [noteBody, setNoteBody] = useState("");
  const [notePosting, setNotePosting] = useState(false);

  // ---- Helpers ------------------------------------------------------------
  const openTasks = taskList.filter((t) => t.status === "open" || t.status === "in_progress" || t.status === "waiting");
  const doneTasks = taskList.filter((t) => t.status === "done" || t.status === "cancelled").slice(0, 5);

  // Aggregate contact stats
  const keyContactCount = contacts.filter((c) => Array.isArray(c.key_contact) && c.key_contact.length > 0).length;
  const contactsWithEmail = contacts.filter((c) => c.email).length;

  // Activity summary buckets
  const activityByKind = activity.reduce<Record<string, number>>((acc, a) => {
    acc[a.kind || "other"] = (acc[a.kind || "other"] || 0) + 1;
    return acc;
  }, {});
  const totalActivity = activity.length;

  const notes = activity.filter((a) => a.kind === "note");

  // ---- Actions ------------------------------------------------------------
  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: company.id,
          title: newTitle.trim(),
          assigned_to: newAssignee.trim() || null,
          due_at: newDueAt || null,
        }),
      });
      if (res.ok) {
        const { task } = await res.json();
        setTaskList((prev) => [task, ...prev]);
        setNewTitle("");
        setNewAssignee("");
        setNewDueAt("");
        start(() => router.refresh());
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to create task");
      }
    } finally {
      setCreating(false);
    }
  }

  async function updateTaskStatus(id: string, status: TaskItem["status"]) {
    // Optimistic
    setTaskList((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: { status } }),
    });
    if (!res.ok) {
      // Revert
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to update task");
      start(() => router.refresh());
    }
  }

  async function deleteTask(id: string) {
    if (!confirm("Delete this task?")) return;
    setTaskList((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Failed to delete");
      start(() => router.refresh());
    }
  }

  async function postNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setNotePosting(true);
    try {
      const res = await fetch("/api/activities/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: company.id,
          kind: "note",
          subject: noteBody.trim().slice(0, 80),
          body: noteBody.trim(),
          meta: { channel: "overview" },
        }),
      });
      if (res.ok) {
        setNoteBody("");
        start(() => router.refresh());
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to post note");
      }
    } finally {
      setNotePosting(false);
    }
  }

  // ---- Render -------------------------------------------------------------

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      {/* --- LEFT COLUMN --- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* At-a-glance strip */}
        <PanelCard title="At a glance" eyebrow="Company snapshot">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatBox label="Contacts" value={contacts.length} sub={`${keyContactCount} key · ${contactsWithEmail} w/ email`} />
            <StatBox label="Activity" value={totalActivity} sub={activity[0] ? `Last: ${fmtDate(activity[0].occurred_at)}` : "None yet"} />
            <StatBox label="Open tasks" value={openTasks.length} sub={openTasks.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length > 0 ? "⚠ overdue" : "on track"} />
            <StatBox label="Agent runs" value={agentRuns.length} sub={agentRuns[0] ? agentRuns[0].kind : "no runs yet"} />
          </div>
        </PanelCard>

        {/* Activity feed */}
        <PanelCard title="Activity log" eyebrow="Everything that happens with this company">
          {totalActivity === 0 ? (
            <EmptyRow>No activity logged yet. Send an email, log a touch, or move the pipeline — everything shows up here.</EmptyRow>
          ) : (
            <>
              {/* Kind buckets */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {Object.entries(activityByKind)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => (
                    <span key={k} className="tk-badge" style={{ fontSize: 11 }}>{k} · {n}</span>
                  ))}
              </div>
              <div>
                {activity.slice(0, 15).map((a) => (
                  <div key={a.id} style={rowStyle}>
                    <div style={{ width: 92, fontSize: 11, color: "var(--tk-text-muted)", flexShrink: 0 }}>{fmtDate(a.occurred_at)}</div>
                    <KindDot kind={a.kind} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        <span style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, color: "var(--tk-text-muted)", marginRight: 8 }}>{a.kind}</span>
                        {a.subject || <span style={{ color: "var(--tk-text-muted)" }}>—</span>}
                      </div>
                      {a.body && (
                        <div style={{ color: "var(--tk-text-secondary)", fontSize: 12, marginTop: 2, whiteSpace: "pre-wrap" }}>{a.body}</div>
                      )}
                      {(a.actor || a.source) && (
                        <div style={{ fontSize: 10, color: "var(--tk-text-muted)", marginTop: 3 }}>
                          {a.actor && <>by {a.actor}</>}
                          {a.actor && a.source && " · "}
                          {a.source && <>via {a.source}</>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {totalActivity > 15 && (
                  <div style={{ paddingTop: 10, fontSize: 12, color: "var(--tk-text-muted)" }}>
                    Showing 15 of {totalActivity}. Older activity in Engagement.
                  </div>
                )}
              </div>
            </>
          )}
        </PanelCard>

        {/* Tasks */}
        <PanelCard title="Tasks" eyebrow="Open · in progress · waiting">
          <form onSubmit={createTask} style={{ display: "grid", gridTemplateColumns: "1fr 140px 150px auto", gap: 8, marginBottom: 12 }}>
            <input
              className="tk-input"
              placeholder="Add a task…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={inputStyle}
            />
            <input
              className="tk-input"
              placeholder="Assignee"
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              style={inputStyle}
            />
            <input
              className="tk-input"
              type="date"
              value={newDueAt}
              onChange={(e) => setNewDueAt(e.target.value)}
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="tk-btn tk-btn-primary"
              style={{ ...btnStyle, opacity: creating || !newTitle.trim() ? 0.5 : 1 }}
            >
              {creating ? "Adding…" : "Add"}
            </button>
          </form>

          {openTasks.length === 0 && doneTasks.length === 0 ? (
            <EmptyRow>No tasks yet. Add one above.</EmptyRow>
          ) : (
            <>
              {openTasks.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {openTasks.map((t) => (
                    <TaskRowItem key={t.id} t={t} onStatus={(s) => updateTaskStatus(t.id, s)} onDelete={() => deleteTask(t.id)} />
                  ))}
                </div>
              )}
              {doneTasks.length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer", color: "var(--tk-text-muted)", fontSize: 12, padding: "6px 0" }}>
                    Recently completed ({doneTasks.length})
                  </summary>
                  <div style={{ marginTop: 6, opacity: 0.6 }}>
                    {doneTasks.map((t) => (
                      <TaskRowItem key={t.id} t={t} onStatus={(s) => updateTaskStatus(t.id, s)} onDelete={() => deleteTask(t.id)} />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </PanelCard>

        {/* Notes / quick capture */}
        <PanelCard title="Notes" eyebrow="Quick capture · logged to activity feed">
          <form onSubmit={postNote}>
            <textarea
              placeholder={`Note about ${company.name}…`}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              style={{
                width: "100%",
                minHeight: 76,
                padding: 10,
                border: "1px solid var(--tk-border)",
                borderRadius: 8,
                fontSize: 13,
                fontFamily: "inherit",
                background: "white",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>
                {notes.length > 0 ? `${notes.length} note${notes.length === 1 ? "" : "s"} on file` : "No notes yet"}
              </div>
              <button
                type="submit"
                disabled={notePosting || !noteBody.trim()}
                className="tk-btn tk-btn-primary"
                style={{ ...btnStyle, opacity: notePosting || !noteBody.trim() ? 0.5 : 1 }}
              >
                {notePosting ? "Saving…" : "Save note"}
              </button>
            </div>
          </form>

          {notes.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--tk-border)", paddingTop: 10 }}>
              {notes.slice(0, 3).map((n) => (
                <div key={n.id} style={rowStyle}>
                  <div style={{ width: 78, fontSize: 11, color: "var(--tk-text-muted)", flexShrink: 0 }}>{fmtDate(n.occurred_at)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{n.body}</div>
                  </div>
                </div>
              ))}
              {notes.length > 3 && (
                <div style={{ fontSize: 11, color: "var(--tk-text-muted)", paddingTop: 6 }}>
                  {notes.length - 3} more in Journal.
                </div>
              )}
            </div>
          )}
        </PanelCard>
      </div>

      {/* --- RIGHT COLUMN --- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PanelCard title="Highlights" eyebrow="Roll-up">
          <SummaryList
            items={[
              ["Sponsor tier", company.sponsor_tier],
              ["Keep", company.keep],
              ["Customer", company.is_customer ? "Yes" : "No"],
              ["Owner", company.company_owner],
              ["Industry", company.industry],
              ["Country", company.country_region],
              ["Employees", company.number_of_employees],
              ["Contacts", String(contacts.length)],
            ]}
          />
        </PanelCard>

        <PanelCard title="Summit interest" eyebrow="Where they lean in">
          {(company.summit_interest && company.summit_interest.length > 0) ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {company.summit_interest.map((s: string) => (
                <span key={s} className="tk-badge tk-badge-accent" style={{ fontSize: 11 }}>{s}</span>
              ))}
            </div>
          ) : (
            <EmptyRow>No summit interest tagged.</EmptyRow>
          )}
        </PanelCard>

        <PanelCard title="Agent runs" eyebrow="Research · enrichment · outreach">
          {agentRuns.length === 0 ? (
            <EmptyRow>No agent has run against this company yet. Kick one off from any panel.</EmptyRow>
          ) : (
            <div>
              {agentRuns.slice(0, 6).map((r) => (
                <div key={r.id} style={{ ...rowStyle, alignItems: "flex-start" }}>
                  <StatusDot status={r.status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{r.kind}</div>
                    <div style={{ fontSize: 11, color: "var(--tk-text-muted)", marginTop: 2 }}>
                      {r.model && <>{r.model} · </>}
                      {fmtDate(r.started_at)}
                      {r.finished_at && <> → {fmtDate(r.finished_at)}</>}
                    </div>
                    {r.error && <div style={{ fontSize: 11, color: "#c2410c", marginTop: 2 }}>{r.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard title="Next actions" eyebrow="Suggested">
          <NextActions company={company} openTasks={openTasks} contacts={contacts} activity={activity} />
        </PanelCard>
      </div>
    </div>
  );
}

// ---- Sub-components ----------------------------------------------------

function TaskRowItem({
  t,
  onStatus,
  onDelete,
}: {
  t: TaskItem;
  onStatus: (s: TaskItem["status"]) => void;
  onDelete: () => void;
}) {
  const done = t.status === "done" || t.status === "cancelled";
  const overdue = t.due_at && new Date(t.due_at) < new Date() && !done;

  return (
    <div style={{ ...rowStyle, alignItems: "flex-start" }}>
      <button
        onClick={() => onStatus(done ? "open" : "done")}
        title={done ? "Reopen" : "Mark done"}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: "1.5px solid " + (done ? "var(--tk-text-muted)" : "var(--tk-border-strong)"),
          background: done ? "var(--tk-text-muted)" : "white",
          color: "white",
          fontSize: 12,
          cursor: "pointer",
          flexShrink: 0,
          padding: 0,
          lineHeight: 1,
        }}
      >
        {done ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13, textDecoration: done ? "line-through" : "none" }}>{t.title}</div>
        {t.detail && <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 2 }}>{t.detail}</div>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4, fontSize: 11, color: "var(--tk-text-muted)" }}>
          <select
            value={t.status}
            onChange={(e) => onStatus(e.target.value as TaskItem["status"])}
            style={{
              fontSize: 11,
              padding: "1px 4px",
              border: "1px solid var(--tk-border)",
              borderRadius: 4,
              background: "white",
            }}
          >
            <option value="open">open</option>
            <option value="in_progress">in progress</option>
            <option value="waiting">waiting</option>
            <option value="done">done</option>
            <option value="cancelled">cancelled</option>
          </select>
          {t.assigned_to && <span>· {t.assigned_to}</span>}
          {t.due_at && <span style={{ color: overdue ? "#c2410c" : "inherit", fontWeight: overdue ? 600 : 400 }}>· due {fmtDate(t.due_at)}</span>}
          {t.origin && t.origin !== "manual" && <span>· {t.origin}</span>}
        </div>
      </div>
      <button
        onClick={onDelete}
        title="Delete"
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--tk-text-muted)", padding: 4, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "var(--tk-bg-muted)",
        border: "1px solid var(--tk-border)",
      }}
    >
      <div className="tk-eyebrow" style={{ fontSize: 10 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--tk-font-serif)", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--tk-text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function NextActions({
  company,
  openTasks,
  contacts,
  activity,
}: {
  company: CompanyRow;
  openTasks: TaskItem[];
  contacts: ContactRow[];
  activity: ActivityRow[];
}) {
  // Heuristic next-actions
  const suggestions: string[] = [];
  const overdueCount = openTasks.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length;

  if (overdueCount > 0) suggestions.push(`Clear ${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`);
  if (contacts.length === 0) suggestions.push("Add a key contact");
  else if (contacts.filter((c) => Array.isArray(c.key_contact) && c.key_contact.length > 0).length === 0) suggestions.push("Tag a key contact");
  if (!company.summit_interest || company.summit_interest.length === 0) suggestions.push("Assign summit interest");
  if (!company.sponsor_tier) suggestions.push("Set sponsor tier");
  if (activity.length === 0) suggestions.push("Log first touch");
  if (company.keep === "Keep" && !company.stay_on_top) suggestions.push("Toggle stay-on-top");

  if (suggestions.length === 0) {
    return <EmptyRow>All caught up. Consider a research agent run to enrich.</EmptyRow>;
  }
  return (
    <div>
      {suggestions.slice(0, 5).map((s, i) => (
        <div key={i} style={{ ...rowStyle, alignItems: "flex-start" }}>
          <span style={{ color: "var(--tk-text-muted)", fontSize: 12, marginTop: 2 }}>{i + 1}.</span>
          <div style={{ flex: 1, fontSize: 13 }}>{s}</div>
        </div>
      ))}
    </div>
  );
}

function SummaryList({ items }: { items: [string, any][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 6 }}>
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: "contents" }}>
          <div style={{ fontSize: 11, color: "var(--tk-text-muted)", textTransform: "uppercase", letterSpacing: 0.5, alignSelf: "center" }}>{k}</div>
          <div style={{ fontSize: 13 }}>{v || <span style={{ color: "var(--tk-text-muted)" }}>—</span>}</div>
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
    <div
      style={{
        border: "1px dashed var(--tk-border-strong)",
        borderRadius: 8,
        padding: 16,
        color: "var(--tk-text-muted)",
        fontSize: 12,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

function KindDot({ kind }: { kind: string }) {
  const color = kindColor(kind);
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        background: color,
        marginTop: 6,
        flexShrink: 0,
      }}
      title={kind}
    />
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "success" || status === "done" ? "#16a34a" :
    status === "error" || status === "failed" ? "#c2410c" :
    status === "running" ? "#2563eb" :
    "#94a3b8";
  return (
    <div style={{ width: 8, height: 8, borderRadius: 4, background: color, marginTop: 6, flexShrink: 0 }} title={status} />
  );
}

function kindColor(kind: string): string {
  switch (kind) {
    case "note": return "#a3a3a3";
    case "email_sent": return "#2563eb";
    case "email_received": return "#0ea5e9";
    case "meeting": return "#8b5cf6";
    case "call": return "#f59e0b";
    case "linkedin_touch": return "#0a66c2";
    case "summit_invite": return "#d946ef";
    case "contract_sent":
    case "contract_signed": return "#16a34a";
    default: return "#94a3b8";
  }
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

// ---- Styles -----------------------------------------------------------

const rowStyle: React.CSSProperties = {
  padding: "8px 0",
  borderTop: "1px solid var(--tk-border)",
  display: "flex",
  gap: 10,
  alignItems: "center",
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--tk-border)",
  borderRadius: 6,
  fontSize: 13,
  background: "white",
};

const btnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  border: "1px solid var(--tk-border-strong)",
  background: "var(--tk-primary)",
  color: "white",
};
