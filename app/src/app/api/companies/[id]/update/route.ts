import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

// PATCH /api/companies/[id]/update
// body: { patch: Partial<CompanyRow> }
// Whitelisted fields only.
export const runtime = "nodejs";

const EDITABLE = new Set([
  "rank_stage",
  "rank_frequency",
  "rank_last_year",
  "sponsor_tier",
  "sponsor_tier_rank",
  "keep",
  "stay_on_top",
  "is_customer",
  "startup",
  "marketing_budget",
  "total_revenue",
  "summit_interest",
  "conferences",
  "conference_speaking",
  "blockers_count",
  "stay_on_top",
  "activity",
  "company_owner",
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any = {};
  try { body = await req.json(); } catch {}
  const patch = body?.patch;
  if (!id || !patch || typeof patch !== "object") {
    return NextResponse.json({ error: "id and patch object required" }, { status: 400 });
  }
  const clean: Record<string, any> = {};
  for (const k of Object.keys(patch)) {
    if (EDITABLE.has(k)) clean[k] = patch[k];
  }
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: "no editable fields in patch" }, { status: 400 });
  }

  let write;
  try { write = dbWrite(); } catch {
    return NextResponse.json({ error: "Writes disabled — set SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  }

  const { data, error } = await write
    .from("companies")
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log stage/tier changes to activities for audit trail
  const notableKeys = ["rank_stage", "sponsor_tier", "keep", "is_customer", "summit_interest", "conferences"];
  const changed = Object.keys(clean).filter((k) => notableKeys.includes(k));
  if (changed.length > 0) {
    await write.from("activities").insert({
      company_id: id,
      contact_id: null,
      kind: "note",
      subject: `Pipeline updated`,
      body: changed.map((k) => `${k}: ${JSON.stringify(clean[k])}`).join(" · "),
      source: "manual",
      actor: "user",
      meta: { channel: "pipeline", changes: clean },
    });
  }

  return NextResponse.json({ company: data });
}
