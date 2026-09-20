// GET /api/email/open?s=<send_id>  → 1x1 tracking pixel
//
// Canonical: insert an 'opened' event into public.campaign_send_event.
// The AFTER INSERT trigger update_campaign_send_rollups() handles:
//   - campaign_send.opens += 1
//   - first_opened_at / last_opened_at
//   - last_event_at
//   - contact.emails_opened, last_email_open_date rollups
// We do not update campaign_send directly here.

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("s");
  if (s) {
    try {
      const ua = req.headers.get("user-agent");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const referrer = req.headers.get("referer");
      await sql`
        insert into public.campaign_send_event
          (send_id, event_kind, occurred_at, user_agent, ip_address, referrer)
        values
          (${s}, ${"opened"}, ${new Date().toISOString()}, ${ua}, ${ip}, ${referrer})
      `;
    } catch {
      // never let a tracker error affect the pixel response
    }
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Content-Length": String(PIXEL.length),
    },
  });
}
