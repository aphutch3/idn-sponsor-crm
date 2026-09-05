import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

export const runtime = "nodejs";

const ALLOWED_STATUS = new Set(["open", "in_progress", "waiting", "done", "cancelled"]);

// POST /api/tasks — create a task
// body: { company_id?, contact_id?, title, detail?, status?, due_at?, assigned_to?, origin? }
export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const { company_id, contact_id, title, detail, status, due_at, assigned_to, origin } = body;
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!company_id && !contact_id) {
    return NextResponse.json({ error: "company_id or contact_id required" }, { status: 400 });
  }
  if (status && !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: `status must be one of: ${[...ALLOWED_STATUS].join(", ")}` }, { status: 400 });
  }

  let write;
  try { write = dbWrite(); } catch {
    return NextResponse.json({ error: "Writes disabled — set SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  }

  const insert: Record<string, any> = {
    title,
    detail: detail || null,
    status: status || "open",
    company_id: company_id || null,
    contact_id: contact_id || null,
    origin: origin || "manual",
  };
  if (due_at) insert.due_at = due_at;
  if (assigned_to) insert.assigned_to = assigned_to;

  const { data, error } = await write.from("tasks").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}
