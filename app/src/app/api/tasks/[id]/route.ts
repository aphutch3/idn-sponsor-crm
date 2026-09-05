import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

export const runtime = "nodejs";

const ALLOWED_STATUS = new Set(["open", "in_progress", "waiting", "done", "cancelled"]);
const EDITABLE = new Set(["title", "detail", "status", "due_at", "assigned_to"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any = {};
  try { body = await req.json(); } catch {}
  const patch = body?.patch;
  if (!id || !patch || typeof patch !== "object") {
    return NextResponse.json({ error: "id and patch object required" }, { status: 400 });
  }
  const clean: Record<string, any> = {};
  for (const k of Object.keys(patch)) if (EDITABLE.has(k)) clean[k] = patch[k];
  if (clean.status && !ALLOWED_STATUS.has(clean.status)) {
    return NextResponse.json({ error: `status must be one of: ${[...ALLOWED_STATUS].join(", ")}` }, { status: 400 });
  }
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: "no editable fields in patch" }, { status: 400 });
  }

  let write;
  try { write = dbWrite(); } catch {
    return NextResponse.json({ error: "Writes disabled" }, { status: 503 });
  }
  const { data, error } = await write
    .from("tasks")
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let write;
  try { write = dbWrite(); } catch {
    return NextResponse.json({ error: "Writes disabled" }, { status: 503 });
  }
  const { error } = await write.from("tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
