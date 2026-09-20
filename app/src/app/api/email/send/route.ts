// POST /api/email/send  { contact_id, subject, body_html, campaign_id? }
// Sends via Resend, injects tracking pixel + click-tracked links, logs a campaign_send row.
//
// Canonical singular tables + trigger-driven rollups (Option C):
//   1. Insert a queued campaign_send row.
//   2. Send via Resend (or stub).
//   3. On success, insert a 'sent' campaign_send_event — the AFTER INSERT trigger
//      update_campaign_send_rollups() flips campaign_send.status to 'sent',
//      sets sent_at, and rolls up last_event_at.
//   4. On failure, update campaign_send directly to status='failed'
//      (no send-lifecycle event kind exists for provider errors).

import { NextRequest, NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";

export const runtime = "nodejs";

function baseUrl(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host");
  return `${proto}://${host}`;
}

function wrapLinks(html: string, sendId: string, base: string) {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, url) => {
    const tracked = `${base}/api/email/click?s=${encodeURIComponent(sendId)}&u=${encodeURIComponent(url)}`;
    return `href="${tracked}"`;
  });
}

type SendBody = {
  contact_id?: string;
  subject?: string;
  body_html?: string;
  campaign_id?: string | null;
  from?: string;
};

type ContactRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  unsubscribed_all_email: boolean | null;
};

export async function POST(req: NextRequest) {
  let body: SendBody = {};
  try { body = await req.json() as SendBody; } catch {}
  const { contact_id, subject, body_html, campaign_id, from } = body;
  if (!contact_id || !subject || !body_html) {
    return NextResponse.json({ error: "contact_id, subject, body_html required" }, { status: 400 });
  }

  // Lookup contact on canonical singular table.
  let contact: ContactRow | null = null;
  try {
    const rows = await sql<ContactRow[]>`
      select id, email, first_name, last_name, unsubscribed_all_email
        from public.contact
       where id = ${contact_id}
       limit 1
    `;
    contact = rows[0] ?? null;
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: `contact lookup: ${err.message}` }, { status: 500 });
  }
  if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: "contact has no email" }, { status: 400 });
  if (contact.unsubscribed_all_email) {
    return NextResponse.json({ error: "contact has unsubscribed" }, { status: 400 });
  }

  // 1. Insert queued campaign_send. recipient_email is USER-DEFINED (email_address
  //    citext-ish domain) — pass the string, Postgres coerces.
  let sendId: string;
  try {
    const rows = await sql<{ id: string }[]>`
      insert into public.campaign_send
        (campaign_id, contact_id, recipient_email, subject, status, provider)
      values
        (${campaign_id ?? null},
         ${contact_id},
         ${contact.email},
         ${subject},
         ${"queued"},
         ${"resend"})
      returning id
    `;
    if (rows.length === 0) throw new Error("no id returned");
    sendId = rows[0].id;
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: `campaign_send insert: ${err.message}` }, { status: 500 });
  }

  const base = baseUrl(req);
  const pixel = `<img src="${base}/api/email/open?s=${sendId}" width="1" height="1" alt="" style="display:none" />`;
  const tracked = wrapLinks(body_html, sendId, base) + pixel;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // No provider key — stub the send: keep status=queued, store the rendered HTML for review.
    try {
      await sql`
        update public.campaign_send
           set stubbed_html = ${tracked}
         where id = ${sendId}
      `;
    } catch (e) {
      const err = dbError(e);
      return NextResponse.json({ error: `stub update: ${err.message}` }, { status: 500 });
    }
    return NextResponse.json({
      send_id: sendId,
      stubbed: true,
      note: "Set RESEND_API_KEY to send for real. Rendered HTML saved on the send row.",
    });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: from || process.env.RESEND_FROM || "IDN <hello@idn.example.com>",
        to: contact.email,
        subject,
        html: tracked,
      }),
    });
    const j = await res.json() as { id?: string; message?: string };
    if (!res.ok) throw new Error(j?.message || `Resend ${res.status}`);

    // Record provider message id, then emit 'sent' event so the rollup trigger
    // flips status → 'sent' and sets sent_at.
    const nowIso = new Date().toISOString();
    try {
      await sql`
        update public.campaign_send
           set provider_message_id = ${j.id ?? null}
         where id = ${sendId}
      `;
      await sql`
        insert into public.campaign_send_event
          (send_id, event_kind, occurred_at, raw)
        values
          (${sendId},
           ${"sent"},
           ${nowIso},
           ${sql.json({ provider: "resend", provider_message_id: j.id ?? null } as unknown as Parameters<typeof sql.json>[0])})
      `;
    } catch (e) {
      // The message went out; a rollup failure shouldn't fail the API.
      const err = dbError(e);
      return NextResponse.json({
        send_id: sendId,
        provider_message_id: j.id ?? null,
        warning: `sent event insert failed: ${err.message}`,
      });
    }
    return NextResponse.json({ send_id: sendId, provider_message_id: j.id ?? null });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    try {
      await sql`
        update public.campaign_send
           set status = ${"failed"},
               error  = ${msg}
         where id = ${sendId}
      `;
    } catch {
      // best-effort; do not shadow the original error
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
