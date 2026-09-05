"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui";
import type { CompanyRow, CompanyContactRow, CompanyActivityRow, CompanySendRow } from "./company-shell";

type Channel = "email" | "x" | "linkedin";
const EMAIL_ACCENT = "#00afa8";
const X_ACCENT = "#111318";
const LI_ACCENT = "#0a66c2";

export function CompanyEngagementPanel({
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
  const [channel, setChannel] = React.useState<Channel>("email");

  // Roll-ups per channel for the tab pills
  const emailCount = sends.length + activity.filter((a) => (a.meta as any)?.channel === "email" || a.kind === "email_sent" || a.kind === "email_received").length;
  const xCount = activity.filter((a) => (a.meta as any)?.channel === "x").length;
  const liCount = activity.filter((a) => (a.meta as any)?.channel === "linkedin" || a.kind === "linkedin_touch").length;

  const contactsWithEmail = contacts.filter((c) => c.email && !c.unsubscribed_all_email).length;
  const contactsWithLI = contacts.filter((c) => c.linkedin_url).length;
  const contactsWithX = contacts.filter((c) => (c as any).twitter_username).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tabs strip on grey */}
      <ChannelTabs
        active={channel}
        onSelect={setChannel}
        tabs={[
          {
            key: "email",
            label: "Email",
            subline: `${contactsWithEmail} of ${contacts.length} reachable`,
            count: emailCount,
            accent: EMAIL_ACCENT,
          },
          {
            key: "x",
            label: "X.com",
            subline: `${contactsWithX} handles on file`,
            count: xCount,
            accent: X_ACCENT,
          },
          {
            key: "linkedin",
            label: "LinkedIn",
            subline: `${contactsWithLI} profiles on file`,
            count: liCount,
            accent: LI_ACCENT,
          },
        ]}
      />

      {channel === "email" && (
        <EmailChannel company={company} contacts={contacts} activity={activity} sends={sends} />
      )}
      {channel === "x" && (
        <XChannel company={company} contacts={contacts} activity={activity} />
      )}
      {channel === "linkedin" && (
        <LinkedInChannel company={company} contacts={contacts} activity={activity} />
      )}
    </div>
  );
}

// --- Tabs strip ---------------------------------------------------------

function ChannelTabs({
  active,
  onSelect,
  tabs,
}: {
  active: Channel;
  onSelect: (c: Channel) => void;
  tabs: { key: Channel; label: string; subline: string; count: number; accent: string }[];
}) {
  return (
    <div
      role="tablist"
      aria-label="Company engagement channel"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--tk-border)",
        alignItems: "stretch",
        background: "var(--tk-bg-muted, #f4f4f4)",
        padding: "0 8px",
        borderRadius: "8px 8px 0 0",
      }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(t.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              background: isActive ? "white" : "transparent",
              border: "none",
              borderTop: isActive ? "1px solid var(--tk-border)" : "1px solid transparent",
              borderLeft: isActive ? "1px solid var(--tk-border)" : "1px solid transparent",
              borderRight: isActive ? "1px solid var(--tk-border)" : "1px solid transparent",
              borderBottom: isActive ? `2px solid ${t.accent}` : "2px solid transparent",
              borderRadius: "6px 6px 0 0",
              marginBottom: -1,
              marginTop: 6,
              cursor: "pointer",
              color: isActive ? "var(--tk-text)" : "var(--tk-text-muted)",
              fontWeight: isActive ? 600 : 500,
              fontSize: 14,
            }}
          >
            <ChannelGlyph channel={t.key} accent={t.accent} size={26} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
              <span>{t.label}</span>
              <span style={{ fontSize: 11, color: "var(--tk-text-muted)", fontWeight: 400 }}>{t.subline}</span>
            </div>
            <span
              style={{
                fontSize: 11,
                background: isActive ? t.accent : "var(--tk-border)",
                color: isActive ? "white" : "var(--tk-text-muted)",
                borderRadius: 999,
                padding: "2px 8px",
                fontWeight: 600,
                fontFamily: "var(--tk-font-mono, monospace)",
                minWidth: 20,
                textAlign: "center",
              }}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// --- EMAIL channel ------------------------------------------------------

function EmailChannel({
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
  const router = useRouter();
  const reachable = contacts.filter((c) => c.email && !c.unsubscribed_all_email);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [subject, setSubject] = React.useState("");
  const [bodyHtml, setBodyHtml] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: number; failed: number; errors: string[] } | null>(null);

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAll = () => setSelectedIds(reachable.map((c) => c.id));
  const clearAll = () => setSelectedIds([]);

  const disabled = sending || selectedIds.length === 0 || !subject.trim() || !bodyHtml.trim();

  async function send() {
    if (disabled) return;
    setSending(true);
    setResult(null);
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const id of selectedIds) {
      try {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, body_html: bodyHtml, contact_id: id }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          failed++;
          errors.push(`${short(id)}: ${j.error || res.statusText}`);
        } else {
          ok++;
          // Log to unified activity feed too
          fetch("/api/activities/log", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              contact_id: id,
              kind: "email_sent",
              subject,
              body: stripHtml(bodyHtml).slice(0, 500),
              meta: { channel: "email", send_id: j.id || null, stubbed: !!j.stubbed },
            }),
          }).catch(() => {});
        }
      } catch (e: any) {
        failed++;
        errors.push(`${short(id)}: ${e.message || "network error"}`);
      }
    }
    setResult({ ok, failed, errors });
    setSending(false);
    if (ok > 0) {
      setSubject("");
      setBodyHtml("");
      setSelectedIds([]);
      router.refresh();
    }
  }

  // Aggregated email timeline: sends + logged email activities
  const timelineItems = React.useMemo(() => {
    const items: TimelineItem[] = [];
    const seenSendIds = new Set<string>();
    for (const s of sends) {
      seenSendIds.add(s.id);
      const c = contacts.find((x) => x.id === s.contact_id);
      items.push({
        id: `send:${s.id}`,
        when: s.sent_at,
        who: c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email : s.contact_id || "—",
        who_href: s.contact_id ? `/contacts/${s.contact_id}` : null,
        title: s.subject || "(no subject)",
        status: s.status || "sent",
        detail: `${s.opens || 0} opens · ${s.clicks || 0} clicks`,
        channel: "email",
      });
    }
    for (const a of activity) {
      if ((a.meta as any)?.send_id && seenSendIds.has((a.meta as any).send_id)) continue;
      if (a.kind !== "email_sent" && a.kind !== "email_received" && (a.meta as any)?.channel !== "email") continue;
      const c = contacts.find((x) => x.id === (a as any).contact_id);
      items.push({
        id: `act:${a.id}`,
        when: a.occurred_at,
        who: c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email : "—",
        who_href: (a as any).contact_id ? `/contacts/${(a as any).contact_id}` : null,
        title: a.subject || a.kind || "activity",
        status: a.kind === "email_received" ? "received" : "logged",
        detail: a.body ? a.body.slice(0, 140) : "",
        channel: "email",
      });
    }
    return items.sort(byDateDesc);
  }, [sends, activity, contacts]);

  return (
    <ChannelCard accent={EMAIL_ACCENT} title="Email" subtitle="Send tracked mail to a chosen subset of company contacts">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}>
        {/* Left: recipients + composer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <SectionLabel>Recipients · {selectedIds.length} of {reachable.length}</SectionLabel>
          <RecipientPicker
            contacts={reachable}
            selectedIds={selectedIds}
            onToggle={toggle}
            onAll={selectAll}
            onClear={clearAll}
            unreachable={contacts.length - reachable.length}
          />

          <SectionLabel>Compose</SectionLabel>
          <input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={inputStyle}
          />
          <textarea
            placeholder="HTML body — use <a href=...> for tracked links. Open pixel is auto-appended."
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={8}
            style={{ ...inputStyle, fontFamily: "var(--tk-font-mono, monospace)", fontSize: 12, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={send}
              disabled={disabled}
              className="tk-btn tk-btn-sm tk-btn-primary"
              style={{ opacity: disabled ? 0.5 : 1 }}
            >
              {sending ? "Sending…" : `Send to ${selectedIds.length || 0}`}
            </button>
            <span style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>
              One request per recipient · tracked opens/clicks · falls back to stub without RESEND_API_KEY
            </span>
          </div>
          {result && (
            <div
              style={{
                marginTop: 6,
                padding: "8px 12px",
                borderRadius: 6,
                background: result.failed === 0 ? "rgba(0,175,168,.08)" : "rgba(220,38,38,.06)",
                border: `1px solid ${result.failed === 0 ? EMAIL_ACCENT : "#dc2626"}`,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {result.ok} sent · {result.failed} failed
              </div>
              {result.errors.length > 0 && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--tk-text-muted)" }}>
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Right: timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <SectionLabel>Timeline · {timelineItems.length}</SectionLabel>
          <TimelineList items={timelineItems} accent={EMAIL_ACCENT} emptyText="No email sends or logged emails yet." />
        </div>
      </div>
    </ChannelCard>
  );
}

// --- X channel ----------------------------------------------------------

function XChannel({
  company,
  contacts,
  activity,
}: {
  company: CompanyRow;
  contacts: CompanyContactRow[];
  activity: CompanyActivityRow[];
}) {
  const router = useRouter();
  const withHandle = contacts.filter((c) => (c as any).twitter_username);
  const [targetId, setTargetId] = React.useState<string>("");
  const [xType, setXType] = React.useState<"post" | "reply" | "dm" | "mention">("post");
  const [note, setNote] = React.useState("");
  const [link, setLink] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const composerText = encodeURIComponent(
    note + (targetId
      ? ` @${((contacts.find((c) => c.id === targetId) as any)?.twitter_username || "").replace(/^@/, "")}`
      : company.twitter_handle
      ? ` @${company.twitter_handle.replace(/^@/, "")}`
      : "")
  );
  const intentUrl = `https://x.com/intent/tweet?text=${composerText}`;

  async function logIt() {
    if (!note.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/activities/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact_id: targetId || null,
          company_id: targetId ? undefined : company.id,
          kind: "note",
          subject: `X ${xType}`,
          body: note,
          meta: { channel: "x", type: xType, link: link || null },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setErr(j.error || res.statusText);
      else {
        setNote("");
        setLink("");
        router.refresh();
      }
    } catch (e: any) {
      setErr(e.message || "network error");
    } finally {
      setSaving(false);
    }
  }

  const timelineItems = activity
    .filter((a) => (a.meta as any)?.channel === "x")
    .map<TimelineItem>((a) => {
      const c = contacts.find((x) => x.id === (a as any).contact_id);
      return {
        id: `act:${a.id}`,
        when: a.occurred_at,
        who: c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email : (a.meta as any)?.target || "company",
        who_href: (a as any).contact_id ? `/contacts/${(a as any).contact_id}` : null,
        title: a.subject || "X activity",
        status: (a.meta as any)?.type || "note",
        detail: a.body || "",
        channel: "x",
        link: (a.meta as any)?.link || null,
      };
    })
    .sort(byDateDesc);

  return (
    <ChannelCard accent={X_ACCENT} title="X.com" subtitle="Log posts, replies, and DMs across the company">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <SectionLabel>Target</SectionLabel>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={inputStyle}>
            <option value="">Company · @{company.twitter_handle?.replace(/^@/, "") || "no handle"}</option>
            {withHandle.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email} · @{(c as any).twitter_username?.replace(/^@/, "")}
              </option>
            ))}
          </select>

          <SectionLabel>Type</SectionLabel>
          <div style={{ display: "flex", gap: 4, background: "var(--tk-bg-muted)", padding: 3, borderRadius: 6 }}>
            {(["post", "reply", "dm", "mention"] as const).map((tp) => (
              <button
                key={tp}
                onClick={() => setXType(tp)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  border: "none",
                  borderRadius: 4,
                  background: xType === tp ? "white" : "transparent",
                  color: xType === tp ? "var(--tk-text)" : "var(--tk-text-muted)",
                  fontWeight: xType === tp ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {tp}
              </button>
            ))}
          </div>

          <SectionLabel>Note</SectionLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What you sent, replied, or plan to post."
            rows={5}
            style={{ ...inputStyle, resize: "vertical" }}
          />

          <SectionLabel>Link (optional)</SectionLabel>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://x.com/…"
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={logIt} disabled={saving || !note.trim()} className="tk-btn tk-btn-sm" style={{ background: X_ACCENT, color: "white", opacity: saving || !note.trim() ? 0.5 : 1 }}>
              {saving ? "Logging…" : "Log X activity"}
            </button>
            <a href={intentUrl} target="_blank" rel="noreferrer" className="tk-btn tk-btn-sm tk-btn-ghost" style={{ textDecoration: "none" }}>
              Open X composer ↗
            </a>
            {err && <span style={{ fontSize: 12, color: "#dc2626" }}>{err}</span>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <SectionLabel>Timeline · {timelineItems.length}</SectionLabel>
          <TimelineList items={timelineItems} accent={X_ACCENT} emptyText="No X activity logged yet." />
        </div>
      </div>
    </ChannelCard>
  );
}

// --- LinkedIn channel ---------------------------------------------------

function LinkedInChannel({
  company,
  contacts,
  activity,
}: {
  company: CompanyRow;
  contacts: CompanyContactRow[];
  activity: CompanyActivityRow[];
}) {
  const router = useRouter();
  const withProfile = contacts.filter((c) => c.linkedin_url);
  const [targetId, setTargetId] = React.useState<string>("");
  const [liType, setLiType] = React.useState<"message" | "connect" | "comment" | "post" | "inmail">("message");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const targetContact = contacts.find((c) => c.id === targetId);
  const openHref = targetContact?.linkedin_url || company.linkedin_url || null;

  async function logIt() {
    if (!note.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/activities/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact_id: targetId || null,
          company_id: targetId ? undefined : company.id,
          kind: "linkedin_touch",
          subject: `LinkedIn ${liType}`,
          body: note,
          meta: { channel: "linkedin", type: liType, link: openHref },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setErr(j.error || res.statusText);
      else {
        setNote("");
        router.refresh();
      }
    } catch (e: any) {
      setErr(e.message || "network error");
    } finally {
      setSaving(false);
    }
  }

  const timelineItems = activity
    .filter((a) => (a.meta as any)?.channel === "linkedin" || a.kind === "linkedin_touch")
    .map<TimelineItem>((a) => {
      const c = contacts.find((x) => x.id === (a as any).contact_id);
      return {
        id: `act:${a.id}`,
        when: a.occurred_at,
        who: c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email : "company",
        who_href: (a as any).contact_id ? `/contacts/${(a as any).contact_id}` : null,
        title: a.subject || "LinkedIn touch",
        status: (a.meta as any)?.type || "touch",
        detail: a.body || "",
        channel: "linkedin",
        link: (a.meta as any)?.link || null,
      };
    })
    .sort(byDateDesc);

  return (
    <ChannelCard accent={LI_ACCENT} title="LinkedIn" subtitle="Log messages, connect requests, comments, and InMail">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <SectionLabel>Target</SectionLabel>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={inputStyle}>
            <option value="">Company · {company.name}</option>
            {withProfile.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email} · profile on file
              </option>
            ))}
          </select>

          <SectionLabel>Type</SectionLabel>
          <div style={{ display: "flex", gap: 4, background: "var(--tk-bg-muted)", padding: 3, borderRadius: 6, flexWrap: "wrap" }}>
            {(["message", "connect", "comment", "post", "inmail"] as const).map((tp) => (
              <button
                key={tp}
                onClick={() => setLiType(tp)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  border: "none",
                  borderRadius: 4,
                  background: liType === tp ? "white" : "transparent",
                  color: liType === tp ? "var(--tk-text)" : "var(--tk-text-muted)",
                  fontWeight: liType === tp ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {tp}
              </button>
            ))}
          </div>

          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="LinkedIn API prevents auto-send — log what you sent or plan to send."
            rows={6}
            style={{ ...inputStyle, resize: "vertical" }}
          />

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={logIt} disabled={saving || !note.trim()} className="tk-btn tk-btn-sm" style={{ background: LI_ACCENT, color: "white", opacity: saving || !note.trim() ? 0.5 : 1 }}>
              {saving ? "Logging…" : "Log LinkedIn touch"}
            </button>
            {openHref && (
              <a href={openHref} target="_blank" rel="noreferrer" className="tk-btn tk-btn-sm tk-btn-ghost" style={{ textDecoration: "none" }}>
                Open profile ↗
              </a>
            )}
            {err && <span style={{ fontSize: 12, color: "#dc2626" }}>{err}</span>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <SectionLabel>Timeline · {timelineItems.length}</SectionLabel>
          <TimelineList items={timelineItems} accent={LI_ACCENT} emptyText="No LinkedIn touches logged yet." />
        </div>
      </div>
    </ChannelCard>
  );
}

// --- Recipient picker ---------------------------------------------------

function RecipientPicker({
  contacts,
  selectedIds,
  onToggle,
  onAll,
  onClear,
  unreachable,
}: {
  contacts: CompanyContactRow[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onAll: () => void;
  onClear: () => void;
  unreachable: number;
}) {
  return (
    <div style={{ border: "1px solid var(--tk-border)", borderRadius: 8, background: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderBottom: "1px solid var(--tk-border)", fontSize: 12 }}>
        <div style={{ color: "var(--tk-text-muted)" }}>
          {contacts.length} reachable{unreachable > 0 && ` · ${unreachable} unsubscribed or missing email`}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onAll}
            style={{ background: "none", border: "none", color: "var(--tk-teal)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
          >
            Select all
          </button>
          <button
            onClick={onClear}
            style={{ background: "none", border: "none", color: "var(--tk-text-muted)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}
          >
            Clear
          </button>
        </div>
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {contacts.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: "var(--tk-text-muted)", textAlign: "center" }}>No reachable contacts.</div>
        ) : (
          contacts.map((c) => {
            const on = selectedIds.includes(c.id);
            const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "—";
            return (
              <label
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "18px 1fr auto",
                  gap: 10,
                  padding: "7px 10px",
                  cursor: "pointer",
                  background: on ? "rgba(0,175,168,.06)" : "transparent",
                  borderTop: "1px solid var(--tk-border)",
                  alignItems: "center",
                }}
              >
                <input type="checkbox" checked={on} onChange={() => onToggle(c.id)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                  <div style={{ fontSize: 11, color: "var(--tk-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.email} {c.job_title ? ` · ${c.job_title}` : ""}
                  </div>
                </div>
                {(c.key_contact || []).slice(0, 1).map((k) => (
                  <Badge key={k} tone="accent">{k}</Badge>
                ))}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

// --- Channel card wrapper ----------------------------------------------

function ChannelCard({
  accent,
  title,
  subtitle,
  children,
}: {
  accent: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="tk-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--tk-border)", display: "flex", alignItems: "center", gap: 14 }}>
        <ChannelGlyph channel={title.toLowerCase().startsWith("email") ? "email" : title.toLowerCase().startsWith("x") ? "x" : "linkedin"} accent={accent} size={40} />
        <div>
          <div className="tk-editorial" style={{ fontSize: 20, lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// --- Timeline -----------------------------------------------------------

type TimelineItem = {
  id: string;
  when: string | null;
  who: string | null;
  who_href: string | null;
  title: string;
  status: string;
  detail: string;
  channel: Channel;
  link?: string | null;
};

function TimelineList({ items, accent, emptyText }: { items: TimelineItem[]; accent: string; emptyText: string }) {
  if (items.length === 0) {
    return (
      <div style={{ padding: 24, border: "1px dashed var(--tk-border-strong)", borderRadius: 8, background: "var(--tk-bg-muted)", color: "var(--tk-text-muted)", fontSize: 13, textAlign: "center" }}>
        {emptyText}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflowY: "auto" }}>
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            borderLeft: `2px solid ${accent}`,
            paddingLeft: 12,
            paddingTop: 8,
            paddingBottom: 8,
            background: "white",
            borderTop: "1px solid var(--tk-border)",
            borderRight: "1px solid var(--tk-border)",
            borderBottom: "1px solid var(--tk-border)",
            borderRadius: "0 6px 6px 0",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{it.title}</div>
            <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>{fmtDate(it.when)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
            <span style={statusBadge(it.status, accent)}>{it.status}</span>
            {it.who && (
              it.who_href ? (
                <Link href={it.who_href} style={{ fontSize: 12, color: "var(--tk-teal)" }}>{it.who}</Link>
              ) : (
                <span style={{ fontSize: 12, color: "var(--tk-text-muted)" }}>{it.who}</span>
              )
            )}
            {it.link && (
              <a href={it.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--tk-teal)" }}>link ↗</a>
            )}
          </div>
          {it.detail && <div style={{ fontSize: 12, color: "var(--tk-text-secondary)", marginTop: 4 }}>{it.detail}</div>}
        </div>
      ))}
    </div>
  );
}

// --- Small bits ---------------------------------------------------------

function ChannelGlyph({ channel, accent, size = 36 }: { channel: Channel; accent: string; size?: number }) {
  const wrap: React.CSSProperties = {
    width: size, height: size, borderRadius: 8, background: accent,
    display: "inline-flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0,
  };
  const s = Math.round(size * 0.55);
  if (channel === "email") {
    return (
      <div style={wrap} aria-hidden="true">
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x={3} y={5} width={18} height={14} rx={2} />
          <path d="M3 7l9 6 9-6" />
        </svg>
      </div>
    );
  }
  if (channel === "x") {
    return (
      <div style={wrap} aria-hidden="true">
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2H21l-6.52 7.46L22 22h-6.828l-4.77-6.24L4.8 22H2l7-8L2 2h6.914l4.31 5.69L18.244 2zm-2.39 18h1.75L7.24 4h-1.9l10.514 16z"/>
        </svg>
      </div>
    );
  }
  return (
    <div style={wrap} aria-hidden="true">
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.22 8h4.56v14H.22V8zm7.44 0h4.37v1.92h.06c.61-1.15 2.1-2.36 4.32-2.36 4.62 0 5.48 3.04 5.48 7v7.44h-4.55V15.4c0-1.7-.03-3.89-2.37-3.89-2.37 0-2.73 1.85-2.73 3.77V22H7.66V8z"/>
      </svg>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--tk-border)",
  borderRadius: 6,
  fontSize: 13,
  background: "white",
  outline: "none",
  fontFamily: "inherit",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--tk-text-muted)", fontWeight: 600 }}>
      {children}
    </div>
  );
}

function statusBadge(status: string, accent: string): React.CSSProperties {
  const s = status.toLowerCase();
  const map: Record<string, { bg: string; fg: string }> = {
    sent: { bg: "rgba(0,175,168,.14)", fg: EMAIL_ACCENT },
    delivered: { bg: "rgba(0,175,168,.14)", fg: EMAIL_ACCENT },
    queued: { bg: "rgba(107,114,128,.14)", fg: "#4b5563" },
    stubbed: { bg: "rgba(245,158,11,.14)", fg: "#b45309" },
    error: { bg: "rgba(220,38,38,.10)", fg: "#dc2626" },
    bounced: { bg: "rgba(220,38,38,.10)", fg: "#dc2626" },
    received: { bg: "rgba(37,99,235,.10)", fg: "#2563eb" },
    logged: { bg: "rgba(107,114,128,.14)", fg: "#4b5563" },
  };
  const pick = map[s] || { bg: `${accent}18`, fg: accent };
  return {
    padding: "2px 8px",
    borderRadius: 999,
    background: pick.bg,
    color: pick.fg,
    fontSize: 10,
    letterSpacing: ".06em",
    textTransform: "uppercase" as const,
    fontWeight: 700,
  };
}

function byDateDesc(a: { when: string | null }, b: { when: string | null }) {
  return (b.when || "").localeCompare(a.when || "");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return String(iso);
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function short(id: string): string {
  return id.slice(0, 8);
}
