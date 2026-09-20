// PATCH a signal — mark triaged or dismissed.
//
// Canonical linkedin_signal has no dedicated triage columns; the state
// is folded into meta.triage. We merge in a single UPDATE using jsonb ||.

import { NextRequest, NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { triaged?: boolean; dismissed?: boolean; triaged_by?: string } = {};
  try { body = await req.json(); } catch {}

  const patch: Record<string, unknown> = {};
  if (body.triaged !== undefined) {
    patch.triaged = body.triaged;
    if (body.triaged) {
      patch.triaged_at = new Date().toISOString();
      if (body.triaged_by) patch.triaged_by = body.triaged_by;
    } else {
      patch.triaged_at = null;
    }
  }
  if (body.dismissed !== undefined) patch.dismissed = body.dismissed;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  try {
    const rows = await sql`
      update public.linkedin_signal
         set meta = coalesce(meta, '{}'::jsonb)
                    || jsonb_build_object('triage',
                         coalesce(meta->'triage', '{}'::jsonb)
                         || ${sql.json(patch as unknown as Parameters<typeof sql.json>[0])}::jsonb)
       where id = ${id}
       returning id, entity_type, entity_id, snapshot_id, prior_snapshot_id,
                 signal_kind, before_value, after_value,
                 created_at as detected_at,
                 coalesce((meta->'triage'->>'triaged')::boolean,   false) as triaged,
                 coalesce((meta->'triage'->>'dismissed')::boolean, false) as dismissed,
                 meta
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ signal: rows[0] });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
