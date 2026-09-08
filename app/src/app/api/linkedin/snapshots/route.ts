// Read-only snapshot lookup, filterable by monitor_config_id, entity, or fetch_type.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const configId = u.searchParams.get("config_id");
  const entityId = u.searchParams.get("entity_id");
  const entityType = u.searchParams.get("entity_type");
  const fetchType = u.searchParams.get("fetch_type");
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") ?? "20")));

  let q = db()
    .from("linkedin_snapshots")
    .select("id, entity_type, entity_id, fetch_type, fetched_at, source_url, http_status, content_hash, parsed, error, monitor_config_id")
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (configId) q = q.eq("monitor_config_id", configId);
  if (entityId) q = q.eq("entity_id", entityId);
  if (entityType) q = q.eq("entity_type", entityType);
  if (fetchType) q = q.eq("fetch_type", fetchType);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data ?? [] });
}
