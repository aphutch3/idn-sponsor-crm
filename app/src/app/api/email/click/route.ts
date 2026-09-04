import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

// GET /api/email/click?s=<send_id>&u=<url>  → logs click and redirects.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("s");
  const u = req.nextUrl.searchParams.get("u");
  const target = u && /^https?:\/\//i.test(u) ? u : "/";
  if (s) {
    try {
      const write = dbWrite();
      const now = new Date().toISOString();
      await write.rpc("record_email_click", { send_id: s, clicked_at: now, url: u }).then(() => {}, async () => {
        await write.from("campaign_sends").update({ clicks: 1, last_clicked_at: now, last_clicked_url: u }).eq("id", s);
      });
    } catch {}
  }
  return NextResponse.redirect(target, { status: 302 });
}
