// Per-config PATCH/DELETE.

import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: PatchBody = {};
  try { body = await req.json(); } catch {}

  const update: Record<string, unknown> = {};
  for (const k of ["name","list_binding_id","fetch_types","cadence_seconds","jitter_seconds","batch_size","per_fetch_delay_ms","active"] as const) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const supa = dbWrite();
  const { data, error } = await supa
    .from("linkedin_monitor_configs")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supa = dbWrite();
  const { error } = await supa.from("linkedin_monitor_configs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
