// Read-only snapshot lookup, filterable by monitor_config_id, entity, or fetch_type.
// Canonical singular: public.linkedin_snapshot.

import { NextRequest, NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const configId = u.searchParams.get("config_id");
  const entityId = u.searchParams.get("entity_id");
  const entityType = u.searchParams.get("entity_type");
  const fetchType = u.searchParams.get("fetch_type");
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") ?? "20")));

  try {
    const rows = await sql`
      select id, entity_type, entity_id, fetch_type, fetched_at, source_url,
             http_status, content_hash, parsed, error, monitor_config_id
        from public.linkedin_snapshot
       where 1 = 1
         ${configId   ? sql`and monitor_config_id = ${configId}`   : sql``}
         ${entityId   ? sql`and entity_id         = ${entityId}`   : sql``}
         ${entityType ? sql`and entity_type       = ${entityType}` : sql``}
         ${fetchType  ? sql`and fetch_type        = ${fetchType}`  : sql``}
       order by fetched_at desc
       limit ${limit}
    `;
    return NextResponse.json({ snapshots: rows });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
