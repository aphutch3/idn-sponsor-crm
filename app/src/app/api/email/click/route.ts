// GET /api/email/click?s=<send_id>&u=<url>  → logs click and redirects.
//
// Canonical: insert a 'clicked' event into public.campaign_send_event.
// The AFTER INSERT trigger update_campaign_send_rollups() handles:
//   - campaign_send.clicks += 1
//   - first_clicked_at / last_clicked_at / last_clicked_url
//   - last_event_at
//   - contact.emails_clicked, last_email_click_date rollups

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("s");
  const u = req.nextUrl.searchParams.get("u");
  const target = u && /^https?:\/\//i.test(u) ? u : "/";
  if (s) {
    try {
      const ua = req.headers.get("user-agent");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const referrer = req.headers.get("referer");
      await sql`
        select public.record_campaign_send_event(
          ${s},'clicked',${new Date().toISOString()},'tracking',${randomUUID()},${u},
          ${sql.json({user_agent:ua,ip_address:ip,referrer})})
      `;
    } catch {
      // best-effort — always redirect regardless
    }
  }
  return NextResponse.redirect(new URL(target,req.url), { status: 302 });
}
