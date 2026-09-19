import { NextRequest, NextResponse } from "next/server";
import { sql, dbError, tx } from "@/lib/db";

// PATCH /api/companies/[id]/update
// body: { patch: Partial<CompanyRow> }
// Whitelisted fields only. Every listed column now exists on canonical `company`.
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
  "activity",
  "company_owner",
]);

const NOTABLE = new Set([
  "rank_stage",
  "sponsor_tier",
  "keep",
  "is_customer",
  "summit_interest",
  "conferences",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // fall through
  }
  const patch = (body as { patch?: Record<string, unknown> })?.patch;
  if (!id || !patch || typeof patch !== "object") {
    return NextResponse.json({ error: "id and patch object required" }, { status: 400 });
  }
  const clean: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    if (EDITABLE.has(k)) clean[k] = patch[k];
  }
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: "no editable fields in patch" }, { status: 400 });
  }

  try {
    // Update the company row and log a change entry to activity in one transaction.
    const result = await tx(async (t) => {
      // Build a dynamic UPDATE using postgres.js helper for object => SET.
      // sql`update company set ${sql(obj, ...keys)} where id = ${id} returning *`
      const keys = Object.keys(clean);
      const updated = await t<Array<Record<string, unknown>>>`
        update public.company
           set ${t(clean, ...keys)},
               updated_at = now()
         where id = ${id}
        returning *
      `;
      if (updated.length === 0) {
        throw new Error("company not found");
      }

      const changedNotable = keys.filter((k) => NOTABLE.has(k));
      if (changedNotable.length > 0) {
        const bodyText = changedNotable
          .map((k) => `${k}: ${JSON.stringify(clean[k])}`)
          .join(" · ");
        await t`
          insert into public.activity
            (company_id, contact_id, kind, subject, body, source_system, owner, raw)
          values
            (${id}, null, 'system_note'::activity_kind, 'Pipeline updated', ${bodyText},
             'manual', 'user',
             ${t.json({ channel: "pipeline", changes: clean as Record<string, unknown> } as unknown as Parameters<typeof t.json>[0])})
        `;
      }

      return updated[0];
    });

    return NextResponse.json({ company: result });
  } catch (e) {
    const err = dbError(e);
    const status = err.message === "company not found" ? 404 : 500;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
}
