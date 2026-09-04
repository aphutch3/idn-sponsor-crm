import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

// GET /api/email/open?s=<send_id>  → 1x1 tracking pixel

export const runtime = "nodejs";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("s");
  if (s) {
    try {
      const write = dbWrite();
      const now = new Date().toISOString();
      await write.rpc("record_email_open", { send_id: s, opened_at: now }).then(() => {}, async () => {
        // Fallback if rpc not defined: increment via update
        await write.from("campaign_sends").update({ opens: 1, first_opened_at: now, last_opened_at: now }).eq("id", s);
      });
    } catch {}
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
