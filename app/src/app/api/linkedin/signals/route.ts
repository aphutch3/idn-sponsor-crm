// Read signals, optionally filtered by entity, config, or triage state.
//
// Canonical singular: public.linkedin_signal. This table has no dedicated
// triaged / dismissed / detected_at columns — triage state lives inside
// meta.triage, and creation time is created_at. `detected_at` is exposed
// in the API response as an alias of created_at so callers stay stable.

import { NextRequest, NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignalRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  snapshot_id: string | null;
  prior_snapshot_id: string | null;
  signal_kind: string;
  before_value: unknown;
  after_value: unknown;
  detected_at: string;
  triaged: boolean;
  dismissed: boolean;
  meta: Record<string, unknown> | null;
};

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const entityId = u.searchParams.get("entity_id");
  const entityType = u.searchParams.get("entity_type");
  const configId = u.searchParams.get("config_id");
  const scope = u.searchParams.get("scope"); // 'open' | 'all' — default 'open'
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") ?? "50")));

  try {
    // Signals don't carry monitor_config_id directly — resolve via snapshot join.
    let configSnapshotIds: string[] | null = null;
    if (configId) {
      const snaps = await sql<{ id: string }[]>`
        select id
          from public.linkedin_snapshot
         where monitor_config_id = ${configId}
         order by fetched_at desc
         limit 1000
      `;
      configSnapshotIds = snaps.map((s) => s.id);
      if (configSnapshotIds.length === 0) {
        return NextResponse.json({ signals: [] });
      }
    }

    const rows = await sql<SignalRow[]>`
      select id, entity_type, entity_id, snapshot_id, prior_snapshot_id, signal_kind,
             before_value, after_value,
             created_at                                        as detected_at,
             coalesce((meta->'triage'->>'triaged')::boolean,   false) as triaged,
             coalesce((meta->'triage'->>'dismissed')::boolean, false) as dismissed,
             meta
        from public.linkedin_signal
       where 1 = 1
         ${entityId   ? sql`and entity_id   = ${entityId}`   : sql``}
         ${entityType ? sql`and entity_type = ${entityType}` : sql``}
         ${configSnapshotIds ? sql`and snapshot_id in ${sql(configSnapshotIds)}` : sql``}
         ${scope !== "all"
           ? sql`and coalesce((meta->'triage'->>'triaged')::boolean, false)   = false
                 and coalesce((meta->'triage'->>'dismissed')::boolean, false) = false`
           : sql``}
       order by created_at desc
       limit ${limit}
    `;
    return NextResponse.json({ signals: rows });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
