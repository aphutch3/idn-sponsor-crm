import { NextRequest, NextResponse } from "next/server";
import { sql, dbError, single } from "@/lib/db";

export const runtime = "nodejs";

// App-facing keys → canonical column names.
// meta lives under `raw` on canonical activity.
const COLUMN_MAP: Record<string, string> = {
  subject: "subject",
  body: "body",
  meta: "raw",
  occurred_at: "occurred_at",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const patch = (body as { patch?: Record<string, unknown> })?.patch;
  if (!id || !patch || typeof patch !== "object") {
    return NextResponse.json({ error: "id and patch object required" }, { status: 400 });
  }

  const clean: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    const canonical = COLUMN_MAP[k];
    if (canonical) clean[canonical] = patch[k];
  }
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: "no editable fields in patch" }, { status: 400 });
  }

  try {
    const keys = Object.keys(clean);
    const rows = await sql<Array<Record<string, unknown>>>`
      update public.activity
         set ${sql(clean, ...keys)}
       where id = ${id}
      returning id, contact_id, company_id, kind, subject, body,
                source_system as source, owner as actor, raw as meta,
                occurred_at, created_at
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "activity not found" }, { status: 404 });
    }
    return NextResponse.json({ activity: single(rows) });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await sql`delete from public.activity where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}
