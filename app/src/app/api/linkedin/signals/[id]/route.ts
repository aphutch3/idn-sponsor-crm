// PATCH a signal — mark triaged or dismissed.

import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { triaged?: boolean; dismissed?: boolean; triaged_by?: string } = {};
  try { body = await req.json(); } catch {}
  const update: Record<string, unknown> = {};
  if (body.triaged !== undefined) {
    update.triaged = body.triaged;
    if (body.triaged) {
      update.triaged_at = new Date().toISOString();
      if (body.triaged_by) update.triaged_by = body.triaged_by;
    } else {
      update.triaged_at = null;
    }
  }
  if (body.dismissed !== undefined) update.dismissed = body.dismissed;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const supa = dbWrite();
  const { data, error } = await supa
    .from("linkedin_signals")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signal: data });
}
