import { NextResponse } from "next/server";
import { refreshSocialMentions } from "@/lib/social-refresh";

// Vercel default is 10s — 8 sequential X searches can push past that.
export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await refreshSocialMentions();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
