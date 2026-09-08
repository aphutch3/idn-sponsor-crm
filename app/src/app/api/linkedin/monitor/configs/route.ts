// CRUD for linkedin_monitor_configs — used by the admin UI at /linkedin-monitor.
// Open (like the rest of the CRM admin surface). Server-side only; no client-visible secrets.

import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_TYPES = new Set([
  "company_page",
  "company_posts",
  "company_people",
  "profile_public",
  "profile_activity",
]);

export async function GET() {
  const supa = dbWrite();
  const { data, error } = await supa
    .from("linkedin_monitor_configs")
    .select("*, list_bindings(id, list_id, binding_type, honor_suppressions, lists:list_id(id, name, kind, entity_types))")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configs: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    list_binding_id?: string;
    fetch_types?: string[];
    cadence_seconds?: number;
    jitter_seconds?: number;
    batch_size?: number;
    per_fetch_delay_ms?: number;
    active?: boolean;
  } = {};
  try { body = await req.json(); } catch {}

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const fetchTypes = Array.isArray(body.fetch_types) && body.fetch_types.length > 0
    ? body.fetch_types.filter((t) => FETCH_TYPES.has(t))
    : ["company_page"];
  if (fetchTypes.length === 0) {
    return NextResponse.json({ error: "at least one valid fetch_type required" }, { status: 400 });
  }

  const supa = dbWrite();
  const { data, error } = await supa
    .from("linkedin_monitor_configs")
    .insert({
      name: body.name.trim(),
      list_binding_id: body.list_binding_id ?? null,
      fetch_types: fetchTypes,
      cadence_seconds: body.cadence_seconds ?? 21600,
      jitter_seconds: body.jitter_seconds ?? 1800,
      batch_size: body.batch_size ?? 15,
      per_fetch_delay_ms: body.per_fetch_delay_ms ?? 60000,
      active: body.active ?? true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}
