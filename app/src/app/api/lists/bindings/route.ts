// List binding picker for the LinkedIn monitor UI.
// Returns bindings with parent list info for display.

import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await db()
    .from("list_bindings")
    .select("id, binding_type, active, honor_suppressions, list_id, lists:list_id(id, name, kind, entity_type)")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bindings: data ?? [] });
}
