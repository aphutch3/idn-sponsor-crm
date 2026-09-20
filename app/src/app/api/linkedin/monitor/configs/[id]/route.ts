// Per-config PATCH/DELETE. Canonical singular: public.linkedin_monitor_config.

import { NextRequest, NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = Partial<{
  name: string;
  list_binding_id: string | null;
  fetch_types: string[];
  cadence_seconds: number;
  jitter_seconds: number;
  batch_size: number;
  per_fetch_delay_ms: number;
  active: boolean;
}>;

const ALLOWED = [
  "name",
  "list_binding_id",
  "fetch_types",
  "cadence_seconds",
  "jitter_seconds",
  "batch_size",
  "per_fetch_delay_ms",
  "active",
] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: PatchBody = {};
  try { body = await req.json(); } catch {}

  const update: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  const keys = Object.keys(update);
  if (keys.length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  try {
    const rows = await sql`
      update public.linkedin_monitor_config
         set ${sql(update, ...(keys as [string, ...string[]]))},
             updated_at = now()
       where id = ${id}
       returning *
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ config: rows[0] });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await sql`delete from public.linkedin_monitor_config where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
