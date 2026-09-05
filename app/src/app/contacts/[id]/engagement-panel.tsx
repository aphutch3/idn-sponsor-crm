"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

export type ContactStub = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  twitter_username: string | null;
  unsubscribed_all_email?: boolean | null;
  emails_delivered: number | null;
  emails_opened: number | null;
  emails_clicked: number | null;
  emails_replied: number | null;
  emails_bounced: number | null;
  last_email_send_date: string | null;
  last_email_open_date: string | null;
  last_email_click_date: string | null;
  last_email_reply_date: string | null;
};

export type SendRow = {
  id: string;
  subject: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string | null;
  opens?: number | null;
  clicks?: number | null;
  first_opened_at?: string | null;
  last_opened_at?: string | null;
  last_clicked_at?: string | null;
  last_clicked_url?: string | null;
  provider_message_id?: string | null;
  campaign_id?: string | null;
  error?: string | null;
};

export type ActivityRow = {
  id: string;
  kind: string | null;
  subject: string | null;
  body: string | null;
  occurred_at: string | null;
  source?: string | null;
  meta?: Record<string, any> | null;
};

type Channel = "email" | "x" | "linkedin";

export function EngagementPanel({
  contact,
  sends,
  activities,
}: {
  contact: ContactStub;
  sends: SendRow[];
  activities: ActivityRow[];
}) {
  const router = useRouter();
  const [channel, setChannel] = React.useState<Channel>("email");

  // Partition activities by channel using kind + meta.channel
  const byChannel = React.useMemo(() => {
    const email: ActivityRow[] = [];
    const x: ActivityRow[] = [];
    const linkedin: ActivityRow[] = [];
    for (const a of activities || []) {
      const ch = (a.meta as any)?.channel;
      if (a.kind === "email_sent" || a.kind === "email_received" || ch === "email") email.push(a);
      else if (a.kind === "linkedin_touch" || ch === "linkedin") linkedin.push(a);
      else if (ch === "x" || ch === "twitter") x.push(a);
    }
    return { email, x, linkedin };
  }, [activities]);

  const tabs: { key: Channel; label: string; accent: string; count: number; sub: string }[] = [
    {
      key: "email",
      label: "Email",
      accent: "#00afa8",
      count: (sends?.length || 0) + byChannel.email.length,
      sub: contact.email || "no email",
    },
    {
      key: "x",
      label: "X.com",
      accent: "#111318",
      count: byChannel.x.length,
      sub: contact.twitter_username ? `@${contact.twitter_username}` : "no handle",
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      accent: "#0a66c2",
      count: byChannel.linkedin.length,
      sub: contact.linkedin_url ? "profile on file" : "no profile",
    },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <ChannelTabs tabs={tabs} active={channel} onSelect={setChannel} />
      {channel === "email" && (
        <EmailChannel
          contact={contact}
          sends={sends}
          activities={byChannel.email}
          onChange={() => router.refresh()}
        />
      )}
      {channel === "x" && (
        <XChannel
          contact={contact}
          activities={byChannel.x}
          onChange={() => router.refresh()}
        />
      )}
      {channel === "linkedin" && (
        <LinkedInChannel
          contact={contact}
          activities={byChannel.linkedin}
          onChange={() => router.refresh()}
        />
      )}
    </div>
  );
}

function ChannelTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { key: Channel; label: string; accent: string; count: number; sub: string }[];
  active: Channel;
  onSelect: (c: Channel) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Engagement channel"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--tk-border)",
        alignItems: "stretch",
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
              background: "transparent",
              border: "none",
              borderBottom: isActive ? `2px solid ${t.accent}` : "2px solid transparent",
              marginBottom: -1,
              cursor: "pointer",
              color: isActive ? "var(--tk-text)" : "var(--tk-text-muted)",
              fontWeight: isActive ? 600 : 500,
              fontSize: 14,
            }}
          >
            <ChannelGlyph channel={t.key} accent={t.accent} size={26} />
            <span style={{ display: "grid", textAlign: "left", lineHeight: 1.15 }}>
              <span>{t.label}</span>
              <span style={{ fontSize: 11, color: "var(--tk-text-muted)", fontWeight: 400 }}>{t.sub}</span>
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "1px 8px",
                borderRadius: 999,
                background: isActive ? t.accent : "var(--tk-bg-muted, #f4f4f4)",
                color: isActive ? "white" : "var(--tk-text-muted)",
                fontWeight: 600,
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

/* ================= EMAIL ================= */

function EmailChannel({
  contact,
  sends,
  activities,
  onChange,
}: {
  contact: ContactStub;
  sends: SendRow[];
  activities: ActivityRow[];
  onChange: () => void;
}) {
  const [subject, setSubject] = React.useState("");
  const [bodyHtml, setBodyHtml] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [flash, setFlash] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [logOpen, setLogOpen] = React.useState(false);

  const canSend =
    !!contact.email && !contact.unsubscribed_all_email && subject.trim() && bodyHtml.trim() && !sending;

  async function send() {
    setSending(true);
    setFlash(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          subject: subject.trim(),
          body_html: bodyHtml.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      // Log an activity mirror for the timeline
      await fetch("/api/activities/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          kind: "email_sent",
          subject: subject.trim(),
          body: bodyHtml.trim(),
          meta: { channel: "email", send_id: j.send_id, stubbed: !!j.stubbed },
        }),
      }).catch(() => {});
      setSubject("");
      setBodyHtml("");
      setFlash({
        tone: "ok",
        text: j.stubbed
          ? `Rendered & tracked (stubbed — set RESEND_API_KEY to send for real). send_id ${j.send_id}`
          : `Sent. provider_message_id ${j.provider_message_id}`,
      });
      onChange();
    } catch (e: any) {
      setFlash({ tone: "err", text: String(e?.message || e) });
    } finally {
      setSending(false);
    }
  }

  const timeline: TimelineItem[] = [
    ...sends.map((s) => ({
      kind: "send" as const,
      id: `send-${s.id}`,
      when: s.sent_at || s.created_at || null,
      title: s.subject || "(no subject)",
      status: s.status || "queued",
      badges: [
        s.opens ? `${s.opens} open${s.opens === 1 ? "" : "s"}` : null,
        s.clicks ? `${s.clicks} click${s.clicks === 1 ? "" : "s"}` : null,
        s.last_opened_at ? `last open ${fmtDate(s.last_opened_at)}` : null,
        s.last_clicked_url ? `→ ${short(s.last_clicked_url)}` : null,
        s.provider_message_id ? "resend" : null,
      ].filter(Boolean) as string[],
      body: s.error || null,
    })),
    ...activities
      .filter((a) => !((a.meta as any)?.send_id)) // don't double-list synced sends
      .map((a) => ({
        kind: "activity" as const,
        id: `act-${a.id}`,
        when: a.occurred_at,
        title: a.subject || a.kind || "note",
        status: a.kind || "note",
        badges: [(a.source && a.source !== "manual" ? a.source : null)].filter(Boolean) as string[],
        body: a.body || null,
      })),
  ].sort(byDateDesc);

  return (
    <ChannelCard
      channel="email"
      title="Email"
      subtitle={contact.email || "no email"}
      accent="#00afa8"
      stats={[
        ["Delivered", fmt(contact.emails_delivered)],
        ["Opens", fmt(contact.emails_opened)],
        ["Clicks", fmt(contact.emails_clicked)],
        ["Replies", fmt(contact.emails_replied)],
        ["Bounces", fmt(contact.emails_bounced)],
      ]}
      lastLine={lastEmailLine(contact)}
      composer={
        <div style={{ display: "grid", gap: 8 }}>
          {contact.unsubscribed_all_email && (
            <div style={warnBox}>Contact has unsubscribed — send is disabled.</div>
          )}
          {!contact.email && <div style={warnBox}>Contact has no email address on file.</div>}
          <input
            className="tk-input"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sending || !contact.email || !!contact.unsubscribed_all_email}
            style={inputStyle}
          />
          <textarea
            className="tk-input"
            placeholder="HTML body — use <a href=…> for tracked links. Open pixel is auto-appended."
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={5}
            disabled={sending || !contact.email || !!contact.unsubscribed_all_email}
            style={{ ...inputStyle, fontFamily: "var(--tk-font-mono, ui-monospace, Menlo, monospace)", fontSize: 12, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="tk-btn tk-btn-primary"
              onClick={send}
              disabled={!canSend}
              style={{ background: "#111318", color: "white" }}
            >
              {sending ? "Sending…" : "Send tracked email"}
            </button>
            <button className="tk-btn tk-btn-ghost" onClick={() => setLogOpen((v) => !v)}>
              {logOpen ? "Cancel log" : "Log received / manual email"}
            </button>
            {flash && (
              <span style={{ fontSize: 12, color: flash.tone === "ok" ? "var(--tk-teal, #00afa8)" : "#c11d1d" }}>
                {flash.text}
              </span>
            )}
          </div>
          {logOpen && (
            <ManualEmailLogger
              contactId={contact.id}
              onDone={() => {
                setLogOpen(false);
                onChange();
              }}
            />
          )}
        </div>
      }
      timeline={timeline}
      emptyText="No email sends or logged emails yet."
    />
  );
}

function ManualEmailLogger({ contactId, onDone }: { contactId: string; onDone: () => void }) {
  const [direction, setDirection] = React.useState<"received" | "sent">("received");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/activities/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          kind: direction === "received" ? "email_received" : "email_sent",
          subject: subject.trim() || null,
          body: body.trim() || null,
          meta: { channel: "email", logged: true },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setSubject("");
      setBody("");
      onDone();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={loggerBox}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 12 }}>
          <input
            type="radio"
            checked={direction === "received"}
            onChange={() => setDirection("received")}
          />{" "}
          Received
        </label>
        <label style={{ fontSize: 12 }}>
          <input
            type="radio"
            checked={direction === "sent"}
            onChange={() => setDirection("sent")}
          />{" "}
          Sent (manual)
        </label>
      </div>
      <input
        className="tk-input"
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        style={inputStyle}
      />
      <textarea
        className="tk-input"
        placeholder="Notes / body"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={{ ...inputStyle, resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="tk-btn tk-btn-primary" onClick={submit} disabled={busy} style={{ background: "#111318", color: "white" }}>
          {busy ? "Saving…" : "Log email"}
        </button>
        {err && <span style={{ fontSize: 12, color: "#c11d1d" }}>{err}</span>}
      </div>
    </div>
  );
}

/* ================= X ================= */

function XChannel({
  contact,
  activities,
  onChange,
}: {
  contact: ContactStub;
  activities: ActivityRow[];
  onChange: () => void;
}) {
  const [text, setText] = React.useState("");
  const [link, setLink] = React.useState("");
  const [postType, setPostType] = React.useState<"reply" | "dm" | "mention" | "post">("reply");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function logIt() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/activities/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          kind: "note",
          subject: `X ${postType}${contact.twitter_username ? ` @${contact.twitter_username}` : ""}`,
          body: text.trim(),
          meta: { channel: "x", type: postType, link: link.trim() || null },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setText("");
      setLink("");
      onChange();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const handle = contact.twitter_username ? `@${contact.twitter_username}` : null;
  const profileHref = handle ? `https://x.com/${contact.twitter_username}` : null;
  const composeHref = handle ? `https://x.com/intent/tweet?text=${encodeURIComponent(text || "")}${handle ? `&in_reply_to=&via=` : ""}` : "https://x.com/compose/post";

  const timeline: TimelineItem[] = activities.map<TimelineItem>((a) => ({
    kind: "activity" as const,
    id: `act-${a.id}`,
    when: a.occurred_at,
    title: a.subject || "X post",
    status: (a.meta as any)?.type || "note",
    badges: [
      (a.meta as any)?.link ? `link ${short((a.meta as any).link)}` : null,
    ].filter(Boolean) as string[],
    body: a.body,
  })).sort(byDateDesc);

  return (
    <ChannelCard
      channel="x"
      title="X.com"
      subtitle={handle || "no X handle"}
      accent="#111318"
      stats={[["Logged posts", String(activities.length)]]}
      lastLine={
        profileHref ? (
          <a href={profileHref} target="_blank" rel="noreferrer" style={{ color: "var(--tk-teal, #00afa8)" }}>
            View profile ↗
          </a>
        ) : null
      }
      composer={
        <div style={{ display: "grid", gap: 8 }}>
          {!handle && <div style={warnBox}>No X handle on file — you can still log posts you made about this contact.</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["reply", "dm", "mention", "post"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPostType(t)}
                className="tk-btn"
                style={{
                  background: postType === t ? "#111318" : "transparent",
                  color: postType === t ? "white" : "var(--tk-text)",
                  border: "1px solid var(--tk-border)",
                  fontSize: 12,
                  padding: "4px 10px",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            className="tk-input"
            placeholder={`What did you ${postType}? (280-ish chars is a soft target)`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <input
            className="tk-input"
            placeholder="Link (optional — original post URL, thread, etc.)"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="tk-btn tk-btn-primary"
              onClick={logIt}
              disabled={busy || !text.trim()}
              style={{ background: "#111318", color: "white" }}
            >
              {busy ? "Saving…" : "Log X touch"}
            </button>
            <a className="tk-btn tk-btn-ghost" href={composeHref} target="_blank" rel="noreferrer">
              Open X composer ↗
            </a>
            {err && <span style={{ fontSize: 12, color: "#c11d1d" }}>{err}</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>
            X posts are logged here — sends happen in X. Wire the X API later to auto-send from this panel.
          </div>
        </div>
      }
      timeline={timeline}
      emptyText="No X touches logged yet."
    />
  );
}

/* ================= LINKEDIN ================= */

function LinkedInChannel({
  contact,
  activities,
  onChange,
}: {
  contact: ContactStub;
  activities: ActivityRow[];
  onChange: () => void;
}) {
  const [text, setText] = React.useState("");
  const [touchType, setTouchType] = React.useState<"message" | "connect" | "comment" | "post" | "inmail">("message");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function logIt() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/activities/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          kind: "linkedin_touch",
          subject: `LinkedIn ${touchType}`,
          body: text.trim(),
          meta: { channel: "linkedin", type: touchType },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setText("");
      onChange();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const timeline: TimelineItem[] = activities.map<TimelineItem>((a) => ({
    kind: "activity" as const,
    id: `act-${a.id}`,
    when: a.occurred_at,
    title: a.subject || "LinkedIn touch",
    status: (a.meta as any)?.type || "touch",
    badges: [] as string[],
    body: a.body,
  })).sort(byDateDesc);

  return (
    <ChannelCard
      channel="linkedin"
      title="LinkedIn"
      subtitle={contact.linkedin_url ? "profile on file" : "no profile"}
      accent="#0a66c2"
      stats={[["Logged touches", String(activities.length)]]}
      lastLine={
        contact.linkedin_url ? (
          <a href={contact.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "var(--tk-teal, #00afa8)" }}>
            Open profile ↗
          </a>
        ) : null
      }
      composer={
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["message", "connect", "comment", "post", "inmail"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTouchType(t)}
                className="tk-btn"
                style={{
                  background: touchType === t ? "#0a66c2" : "transparent",
                  color: touchType === t ? "white" : "var(--tk-text)",
                  border: "1px solid var(--tk-border)",
                  fontSize: 12,
                  padding: "4px 10px",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            className="tk-input"
            placeholder={`Notes on the LinkedIn ${touchType} — what you said, response, next step.`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="tk-btn tk-btn-primary"
              onClick={logIt}
              disabled={busy || !text.trim()}
              style={{ background: "#0a66c2", color: "white" }}
            >
              {busy ? "Saving…" : "Log LinkedIn touch"}
            </button>
            {contact.linkedin_url && (
              <a className="tk-btn tk-btn-ghost" href={contact.linkedin_url} target="_blank" rel="noreferrer">
                Open profile ↗
              </a>
            )}
            {err && <span style={{ fontSize: 12, color: "#c11d1d" }}>{err}</span>}
          </div>
        </div>
      }
      timeline={timeline}
      emptyText="No LinkedIn touches logged yet."
    />
  );
}

/* ================= Shared ================= */

type TimelineItem = {
  kind: "send" | "activity";
  id: string;
  when: string | null;
  title: string;
  status: string;
  badges: string[];
  body: string | null;
};

function ChannelCard({
  channel,
  title,
  subtitle,
  accent,
  stats,
  lastLine,
  composer,
  timeline,
  emptyText,
}: {
  channel: Channel;
  title: string;
  subtitle: string;
  accent: string;
  stats: [string, string][];
  lastLine: React.ReactNode;
  composer: React.ReactNode;
  timeline: TimelineItem[];
  emptyText: string;
}) {
  return (
    <div className="tk-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* header strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--tk-border)", background: "var(--tk-bg-muted, #fafafa)" }}>
        <ChannelGlyph channel={channel} accent={accent} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tk-editorial" style={{ fontSize: 18 }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--tk-text-muted)" }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {stats.map(([k, v]) => (
            <div key={k} style={{ textAlign: "right" }}>
              <div className="tk-eyebrow" style={{ fontSize: 10 }}>{k}</div>
              <div style={{ fontFamily: "var(--tk-font-serif)", fontSize: 18 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {lastLine && (
        <div style={{ padding: "6px 18px", fontSize: 12, color: "var(--tk-text-muted)", borderBottom: "1px solid var(--tk-border)" }}>
          {lastLine}
        </div>
      )}
      {/* body: composer + timeline side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ padding: 18, borderRight: "1px solid var(--tk-border)" }}>
          <div className="tk-eyebrow" style={{ marginBottom: 8 }}>Compose / Log</div>
          {composer}
        </div>
        <div style={{ padding: 18 }}>
          <div className="tk-eyebrow" style={{ marginBottom: 8 }}>Timeline · {timeline.length}</div>
          {timeline.length === 0 ? (
            <div style={{ border: "1px dashed var(--tk-border-strong)", borderRadius: 8, padding: 16, textAlign: "center", color: "var(--tk-text-muted)", fontSize: 12, background: "var(--tk-bg-muted)" }}>
              {emptyText}
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {timeline.slice(0, 25).map((t) => (
                <TimelineItemRow key={t.id} item={t} accent={accent} />
              ))}
              {timeline.length > 25 && (
                <li style={{ fontSize: 11, color: "var(--tk-text-muted)", textAlign: "center" }}>
                  Showing 25 of {timeline.length}
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineItemRow({ item, accent }: { item: TimelineItem; accent: string }) {
  return (
    <li style={{ borderLeft: `2px solid ${accent}`, paddingLeft: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--tk-text-muted)", flexShrink: 0 }}>
          {fmtDate(item.when)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
        <span style={statusBadge(item.status)}>{item.status}</span>
        {item.badges.map((b, i) => (
          <span key={i} style={metaBadge}>{b}</span>
        ))}
      </div>
      {item.body && (
        <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 4, whiteSpace: "pre-wrap", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
          {stripHtml(item.body)}
        </div>
      )}
    </li>
  );
}

function ChannelGlyph({ channel, accent, size = 36 }: { channel: Channel; accent: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.max(6, Math.round(size * 0.22)), background: accent, color: "white",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--tk-font-serif)", fontSize: Math.round(size * 0.45), flexShrink: 0,
    }}>
      {channel === "email" ? "✉" : channel === "x" ? "𝕏" : "in"}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--tk-border)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  background: "white",
  color: "var(--tk-text)",
};

const warnBox: React.CSSProperties = {
  border: "1px solid #f5d0d0",
  background: "#fdf4f4",
  color: "#8a2626",
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
};

const loggerBox: React.CSSProperties = {
  border: "1px solid var(--tk-border)",
  borderRadius: 8,
  padding: 10,
  display: "grid",
  gap: 8,
  background: "var(--tk-bg-muted, #fafafa)",
};

const metaBadge: React.CSSProperties = {
  fontSize: 10,
  padding: "1px 6px",
  border: "1px solid var(--tk-border)",
  borderRadius: 999,
  color: "var(--tk-text-muted)",
  background: "white",
};

function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    sent: { bg: "#e6f7f4", fg: "#005a55" },
    delivered: { bg: "#e6f7f4", fg: "#005a55" },
    queued: { bg: "#f4f4f4", fg: "#555" },
    stubbed: { bg: "#fff8db", fg: "#7a5c00" },
    error: { bg: "#fdecec", fg: "#a11212" },
    bounced: { bg: "#fdecec", fg: "#a11212" },
    email_sent: { bg: "#e6f7f4", fg: "#005a55" },
    email_received: { bg: "#e8efff", fg: "#1e3ea3" },
    linkedin_touch: { bg: "#e8f1fb", fg: "#0a66c2" },
    note: { bg: "#f4f4f4", fg: "#555" },
  };
  const { bg, fg } = map[status] || { bg: "#f4f4f4", fg: "#555" };
  return {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 999,
    background: bg,
    color: fg,
    fontWeight: 500,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  };
}

/* ---------- utils ---------- */

function byDateDesc(a: { when: string | null }, b: { when: string | null }) {
  const ta = a.when ? Date.parse(a.when) : 0;
  const tb = b.when ? Date.parse(b.when) : 0;
  return tb - ta;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return String(iso);
  }
}

function short(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname.length > 1 ? u.pathname.slice(0, 20) : "");
  } catch {
    return url.slice(0, 30);
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function lastEmailLine(c: ContactStub): React.ReactNode {
  const parts: string[] = [];
  if (c.last_email_send_date) parts.push(`sent ${fmtDate(c.last_email_send_date)}`);
  if (c.last_email_open_date) parts.push(`open ${fmtDate(c.last_email_open_date)}`);
  if (c.last_email_click_date) parts.push(`click ${fmtDate(c.last_email_click_date)}`);
  if (c.last_email_reply_date) parts.push(`reply ${fmtDate(c.last_email_reply_date)}`);
  if (parts.length === 0) return null;
  return <>Last: {parts.join(" · ")}</>;
}
