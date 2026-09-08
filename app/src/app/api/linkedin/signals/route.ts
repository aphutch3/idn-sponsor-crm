// Read signals, optionally filtered by entity, config, or triage state.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const entityId = u.searchParams.get("entity_id");
  const entityType = u.searchParams.get("entity_type");
  const configId = u.searchParams.get("config_id");
  const scope = u.searchParams.get("scope"); // 'open' | 'all' — default 'open'
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") ?? "50")));

  let q = db()
    .from("linkedin_signals")
    .select("id, entity_type, entity_id, snapshot_id, prior_snapshot_id, signal_kind, before_value, after_value, detected_at, triaged, dismissed, meta")
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (entityId) q = q.eq("entity_id", entityId);
  if (entityType) q = q.eq("entity_type", entityType);
  if (configId) {
    // signals don't have config_id directly — filter via snapshot join
    const { data: snapIds } = await db()
      .from("linkedin_snapshots")
      .select("id")
      .eq("monitor_config_id", configId)
      .order("fetched_at", { ascending: false })
      .limit(1000);
    const ids = (snapIds ?? []).map((s) => s.id);
    if (ids.length === 0) return NextResponse.json({ signals: [] });
    q = q.in("snapshot_id", ids);
  }
  if (scope !== "all") {
    q = q.eq("triaged", false).eq("dismissed", false);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signals: data ?? [] });
}
