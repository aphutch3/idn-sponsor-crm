import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

// POST /api/activities/log
// { contact_id, kind, subject?, body?, meta? }
// kind must be one of the activity_kind enum values.
export const runtime = "nodejs";

const ALLOWED_KINDS = new Set([
  "note",
  "call",
  "email_sent",
  "email_received",
  "meeting",
  "linkedin_touch",
  "summit_invite",
  "contract_sent",
  "contract_signed",
  "other",
]);

export async function POST(req: NextRequest) {
  let payload: any = {};
  try { payload = await req.json(); } catch {}
  const { contact_id, kind, subject, body, meta } = payload;
  if (!contact_id || !kind) return NextResponse.json({ error: "contact_id and kind required" }, { status: 400 });
  if (!ALLOWED_KINDS.has(kind)) return NextResponse.json({ error: `kind must be one of: ${[...ALLOWED_KINDS].join(", ")}` }, { status: 400 });

  let write;
  try { write = dbWrite(); } catch {
    return NextResponse.json({ error: "Writes disabled — set SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  }

  // Look up the contact's company so activity is linked on both sides.
  const { data: contact } = await write.from("contacts").select("company_id").eq("id", contact_id).maybeSingle();

  const { data, error } = await write.from("activities").insert({
    contact_id,
    company_id: contact?.company_id || null,
    kind,
    subject: subject || null,
    body: body || null,
    source: "manual",
    actor: "user",
    meta: meta || {},
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: data });
}
