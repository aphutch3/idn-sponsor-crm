import { NextRequest, NextResponse } from "next/server";
import { sql, dbError, single, maybeSingle } from "@/lib/db";

// POST /api/activities/log
// { contact_id?, company_id?, kind, subject?, body?, meta? }
// The app-facing `kind` values are mapped to the canonical activity_kind enum.
export const runtime = "nodejs";

// Canonical activity_kind values: email, call, meeting, linkedin, agent_note, system_note, task_note
// The app historically emitted names like 'note', 'email_sent', 'linkedin_touch'; keep accepting those
// and translate. Anything else defaults to 'system_note'.
const KIND_MAP: Record<string, string> = {
  note: "system_note",
  call: "call",
  email_sent: "email",
  email_received: "email",
  email: "email",
  meeting: "meeting",
  linkedin_touch: "linkedin",
  linkedin: "linkedin",
  summit_invite: "system_note",
  contract_sent: "system_note",
  contract_signed: "system_note",
  agent_note: "agent_note",
  system_note: "system_note",
  task_note: "task_note",
  other: "system_note",
};

export async function POST(req: NextRequest) {
  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    /* ignore */
  }
  const p = payload as {
    contact_id?: string | null;
    company_id?: string | null;
    kind?: string;
    subject?: string | null;
    body?: string | null;
    meta?: Record<string, unknown> | null;
  };
  const { contact_id, company_id: companyIdIn, kind: rawKind, subject, body, meta } = p;

  if (!rawKind) return NextResponse.json({ error: "kind required" }, { status: 400 });
  if (!contact_id && !companyIdIn) {
    return NextResponse.json({ error: "contact_id or company_id required" }, { status: 400 });
  }
  const canonicalKind = KIND_MAP[rawKind];
  if (!canonicalKind) {
    return NextResponse.json(
      {
        error: `kind must be one of: ${Object.keys(KIND_MAP).join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    // Resolve company_id from contact if not passed.
    let companyId: string | null = companyIdIn ?? null;
    if (contact_id && !companyId) {
      const row = maybeSingle(
        await sql<Array<{ company_id: string | null }>>`
          select company_id from public.contact where id = ${contact_id}
        `
      );
      companyId = row?.company_id ?? null;
    }

    const rows = await sql<Array<Record<string, unknown>>>`
      insert into public.activity
        (contact_id, company_id, kind, subject, body, source_system, owner, raw)
      values
        (${contact_id ?? null}, ${companyId},
         ${canonicalKind}::activity_kind,
         ${subject ?? null}, ${body ?? null},
         'manual', 'user',
         ${sql.json((meta ?? {}) as unknown as Parameters<typeof sql.json>[0])})
      returning id, contact_id, company_id, kind, subject, body,
                source_system as source, owner as actor, raw as meta,
                occurred_at, created_at
    `;
    return NextResponse.json({ activity: single(rows) });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}
