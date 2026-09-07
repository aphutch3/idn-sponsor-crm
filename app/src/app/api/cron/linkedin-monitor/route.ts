// Vercel cron endpoint: runs all due LinkedIn monitor configs.
// Vercel sends `Authorization: Bearer $CRON_SECRET` to protected cron paths.
// We also accept the same header on manual GET calls for testing.

import { NextRequest, NextResponse } from "next/server";
import { runDueConfigs } from "@/lib/linkedin/monitor";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro; degrade gracefully on Hobby (60s)

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // if unset, treat as open (dev)
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runDueConfigs({ max_configs: 5 });
    return NextResponse.json({
      ok: true,
      at: new Date().toISOString(),
      ...result,
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ ok: false, error: String(err?.message ?? e) }, { status: 500 });
  }
}

// Vercel cron only issues GET, but allow POST for manual bulk-trigger scripts.
export const POST = GET;
