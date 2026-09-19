import { NextRequest, NextResponse } from "next/server";
import { sql, dbError, single } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED_STATUS = new Set(["open", "in_progress", "waiting", "done", "cancelled"]);

// Maps app-facing patch keys to canonical column names.
// (app.detail → task.body)
const COLUMN_MAP: Record<string, string> = {
  title: "title",
  detail: "body",
  status: "status",
  due_at: "due_at",
  assigned_to: "assigned_to",
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

  // Translate app-facing keys → canonical column names.
  const clean: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    const canonical = COLUMN_MAP[k];
    if (canonical) clean[canonical] = patch[k];
  }
  if (clean.status && !ALLOWED_STATUS.has(clean.status as string)) {
    return NextResponse.json(
      { error: `status must be one of: ${[...ALLOWED_STATUS].join(", ")}` },
      { status: 400 }
    );
  }
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: "no editable fields in patch" }, { status: 400 });
  }

  try {
    const keys = Object.keys(clean);
    const rows = await sql<Array<Record<string, unknown>>>`
      update public.task
         set ${sql(clean, ...keys)},
             updated_at = now()
       where id = ${id}
      returning id, title, body as detail, status, company_id, contact_id,
                origin, due_at, assigned_to, meta, created_at, updated_at
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "task not found" }, { status: 404 });
    }
    return NextResponse.json({ task: single(rows) });
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
    await sql`delete from public.task where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}
