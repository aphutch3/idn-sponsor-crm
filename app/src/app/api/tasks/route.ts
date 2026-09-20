import { NextRequest, NextResponse } from "next/server";
import { sql, dbError, single } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED_STATUS = new Set(["open", "in_progress", "waiting", "done", "cancelled"]);

// POST /api/tasks — create a task
// body: { company_id?, contact_id?, title, detail?, status?, due_at?, assigned_to?, origin? }
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const b = body as {
    company_id?: string | null;
    contact_id?: string | null;
    title?: string;
    detail?: string | null;
    status?: string;
    due_at?: string | null;
    assigned_to?: string | null;
    origin?: string;
  };
  const { company_id, contact_id, title, detail, status, due_at, assigned_to, origin } = b;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!company_id && !contact_id) {
    return NextResponse.json({ error: "company_id or contact_id required" }, { status: 400 });
  }
  if (status && !ALLOWED_STATUS.has(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${[...ALLOWED_STATUS].join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const rows = await sql<Array<Record<string, unknown>>>`
      insert into public.task
        (title, body, status, company_id, contact_id, origin, due_at, assigned_to)
      values
        (${title}, ${detail ?? null}, ${status ?? "open"},
         ${company_id ?? null}, ${contact_id ?? null},
         ${origin ?? "manual"}, ${due_at ?? null}, ${assigned_to ?? null})
      returning
        id, title, body as detail, status, company_id, contact_id, origin,
        due_at, assigned_to, meta, created_at, updated_at
    `;
    return NextResponse.json({ task: single(rows) });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}
