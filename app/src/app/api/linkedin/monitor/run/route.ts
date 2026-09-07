// Manual trigger for a single LinkedIn monitor config.
// POST /api/linkedin/monitor/run  { config_id, force? }
// Runs the worker synchronously and returns the summary.

import { NextRequest, NextResponse } from "next/server";
import { runMonitor } from "@/lib/linkedin/monitor";

export const runtime = "nodejs";
export const maxDuration = 300;

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { config_id?: string; force?: boolean } = {};
  try { body = await req.json(); } catch {}
  if (!body.config_id) return NextResponse.json({ error: "config_id required" }, { status: 400 });

  try {
    const summary = await runMonitor(body.config_id, { force: Boolean(body.force) });
    return NextResponse.json({ ok: true, summary });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ ok: false, error: String(err?.message ?? e) }, { status: 500 });
  }
}
