// One-click LinkedIn monitor for a single entity.
// Creates (or reuses) a per-entity static list, binds it, creates a monitor_config,
// and optionally runs it once immediately. Idempotent per entity_id.

import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";
import { addMembers, createList } from "@/lib/lists";
import type { EntityId, EntityType, ListId } from "@/lib/lists";
import { runMonitor } from "@/lib/linkedin/monitor";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type QuickBody = {
  entity_id: string;
  entity_type: "company" | "contact";
  run?: boolean;
};

const QUICK_TAG = "quick-linkedin-monitor";

export async function POST(req: NextRequest) {
  let body: QuickBody | null = null;
  try { body = (await req.json()) as QuickBody; } catch {}
  if (!body?.entity_id || !body?.entity_type) {
    return NextResponse.json({ ok: false, error: "entity_id and entity_type required" }, { status: 400 });
  }
  const { entity_id, entity_type, run } = body;

  const supa = dbWrite();

  // Look up entity display name + linkedin url for a friendly config name.
  const table = entity_type === "company" ? "companies" : "contacts";
  const nameCol = entity_type === "company" ? "name" : "full_name";
  const { data: entity } = await supa
    .from(table)
    .select(`id, ${nameCol}, linkedin_url`)
    .eq("id", entity_id)
    .maybeSingle();
  if (!entity) {
    return NextResponse.json({ ok: false, error: `${entity_type} ${entity_id} not found` }, { status: 404 });
  }
  const entityAny = entity as unknown as Record<string, string | null>;
  if (!entityAny.linkedin_url) {
    return NextResponse.json({ ok: false, error: `${entity_type} has no linkedin_url` }, { status: 400 });
  }
  const displayName = String(entityAny[nameCol] ?? entity_id.slice(0, 8));

  // Try to find an existing quick-monitor config for this entity via meta.
  const { data: existingCfg } = await supa
    .from("linkedin_monitor_configs")
    .select("id, name, list_binding_id, meta")
    .contains("meta", { quick: true, entity_id, entity_type })
    .maybeSingle();

  let configId: string;
  let listId: ListId;
  let configName: string;

  if (existingCfg) {
    configId = existingCfg.id as string;
    configName = existingCfg.name as string;
    // Reactivate if paused.
    await supa.from("linkedin_monitor_configs").update({ active: true, meta: { quick: true, entity_id, entity_type } }).eq("id", configId);
    const { data: bnd } = await supa
      .from("list_bindings")
      .select("list_id")
      .eq("id", existingCfg.list_binding_id as string)
      .maybeSingle();
    listId = (bnd?.list_id as ListId) ?? ("" as ListId);
  } else {
    // Create list.
    const listResult = await createList({
      name: `LinkedIn watch: ${displayName}`,
      kind: "static",
      entity_types: [entity_type],
      description: `Auto-created by Monitor now button for ${entity_type} ${entity_id}`,
      tags: [QUICK_TAG, entity_type],
      meta: { quick: true, entity_id, entity_type },
    });
    if (!listResult.ok) {
      return NextResponse.json({ ok: false, error: `list creation failed: ${listResult.error.kind}` }, { status: 500 });
    }
    listId = listResult.value.id as ListId;

    // Add member.
    const memResult = await addMembers(listId, [
      { entity_type: entity_type as EntityType, entity_id: entity_id as EntityId, source: "manual" },
    ]);
    if (!memResult.ok) {
      return NextResponse.json({ ok: false, error: `add member failed: ${memResult.error.kind}` }, { status: 500 });
    }

    // Create list_binding.
    const { data: binding, error: bindErr } = await supa
      .from("list_bindings")
      .insert({
        list_id: listId,
        binding_type: "linkedin_monitor",
        active: true,
        honor_suppressions: true,
        config: {},
      })
      .select("id")
      .single();
    if (bindErr || !binding) {
      return NextResponse.json({ ok: false, error: `binding failed: ${bindErr?.message ?? "unknown"}` }, { status: 500 });
    }

    // Create monitor config. Choose fetch type by entity kind.
    const fetchTypes = entity_type === "company" ? ["company_page"] : ["profile_public"];
    configName = `Watch: ${displayName}`;
    const { data: cfg, error: cfgErr } = await supa
      .from("linkedin_monitor_configs")
      .insert({
        name: configName,
        list_binding_id: binding.id,
        fetch_types: fetchTypes,
        cadence_seconds: 21600,
        jitter_seconds: 1800,
        batch_size: 5,
        per_fetch_delay_ms: 60000,
        active: true,
        meta: { quick: true, entity_id, entity_type },
      })
      .select("id")
      .single();
    if (cfgErr || !cfg) {
      return NextResponse.json({ ok: false, error: `config failed: ${cfgErr?.message ?? "unknown"}` }, { status: 500 });
    }
    configId = cfg.id as string;
  }

  let summary: unknown = null;
  if (run) {
    try {
      summary = await runMonitor(configId, { force: true });
    } catch (e) {
      return NextResponse.json({
        ok: true,
        quick: { config_id: configId, config_name: configName, list_id: listId },
        summary: null,
        run_error: String((e as Error).message),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    quick: { config_id: configId, config_name: configName, list_id: listId },
    summary,
  });
}
