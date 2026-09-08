// Same-origin run endpoint — used by the admin UI's Run button.
// No bearer required (matches rest of admin surface); runs synchronously.

import { NextRequest, NextResponse } from "next/server";
import { runMonitor } from "@/lib/linkedin/monitor";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { force?: boolean } = {};
  try { body = await req.json(); } catch {}
  try {
    const summary = await runMonitor(id, { force: Boolean(body.force) });
    return NextResponse.json({ ok: true, summary });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ ok: false, error: String(err?.message ?? e) }, { status: 500 });
  }
}
