import { NextRequest, NextResponse } from "next/server";
import { db, dbWrite } from "@/lib/supabase";

// POST /api/email/send  { contact_id, subject, body_html, campaign_id? }
// Sends via Resend, injects tracking pixel + click-tracked links, logs a campaign_send row.

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

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const { contact_id, subject, body_html, campaign_id, from } = body;
  if (!contact_id || !subject || !body_html) return NextResponse.json({ error: "contact_id, subject, body_html required" }, { status: 400 });

  const supa = db();
  const { data: contact } = await supa.from("contacts").select("id, email, first_name, last_name, unsubscribed_all_email").eq("id", contact_id).maybeSingle();
  if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: "contact has no email" }, { status: 400 });
  if (contact.unsubscribed_all_email) return NextResponse.json({ error: "contact has unsubscribed" }, { status: 400 });

  let write;
  try { write = dbWrite(); } catch {
    return NextResponse.json({ error: "Writes disabled — set SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  }

  const { data: send, error: sErr } = await write.from("campaign_sends").insert({
    campaign_id: campaign_id || null,
    contact_id,
    subject,
    status: "queued",
  }).select().single();
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const base = baseUrl(req);
  const pixel = `<img src="${base}/api/email/open?s=${send.id}" width="1" height="1" alt="" style="display:none" />`;
  const tracked = wrapLinks(body_html, send.id, base) + pixel;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    await write.from("campaign_sends").update({ status: "stubbed", stubbed_html: tracked }).eq("id", send.id);
    return NextResponse.json({ send_id: send.id, stubbed: true, note: "Set RESEND_API_KEY to send for real. Rendered HTML saved on the send row." });
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
    const j = await res.json();
    if (!res.ok) throw new Error(j?.message || `Resend ${res.status}`);
    await write.from("campaign_sends").update({ status: "sent", provider_message_id: j.id, sent_at: new Date().toISOString() }).eq("id", send.id);
    return NextResponse.json({ send_id: send.id, provider_message_id: j.id });
  } catch (e: any) {
    await write.from("campaign_sends").update({ status: "error", error: String(e?.message || e) }).eq("id", send.id);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
