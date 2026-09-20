// One-click LinkedIn monitor for a single entity.
// Creates (or reuses) a per-entity static list, binds it, creates a monitor_config,
// and optionally runs it once immediately. Idempotent per entity_id.
//
// Canonical singular tables: company, contact, list_binding, linkedin_monitor_config.

import { NextRequest, NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";
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

  // Look up entity display name + linkedin url for a friendly config name.
  let displayName: string;
  let linkedinUrl: string | null;
  try {
    const rows = entity_type === "company"
      ? await sql<{ id: string; name: string | null; linkedin_url: string | null }[]>`
          select id, name, linkedin_url
            from public.company
           where id = ${entity_id}
           limit 1
        `
      : await sql<{ id: string; name: string | null; linkedin_url: string | null }[]>`
          select id, full_name as name, linkedin_url
            from public.contact
           where id = ${entity_id}
           limit 1
        `;
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: `${entity_type} ${entity_id} not found` }, { status: 404 });
    }
    const entity = rows[0];
    if (!entity.linkedin_url) {
      return NextResponse.json({ ok: false, error: `${entity_type} has no linkedin_url` }, { status: 400 });
    }
    linkedinUrl = entity.linkedin_url;
    displayName = String(entity.name ?? entity_id.slice(0, 8));
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ ok: false, error: `entity lookup: ${err.message}` }, { status: 500 });
  }
  void linkedinUrl; // referenced by runMonitor later via config -> entity URL resolver

  // Try to find an existing quick-monitor config for this entity via meta.
  let existingCfg: { id: string; name: string; list_binding_id: string | null; meta: Record<string, unknown> } | null = null;
  try {
    const rows = await sql<Array<{
      id: string;
      name: string;
      list_binding_id: string | null;
      meta: Record<string, unknown>;
    }>>`
      select id, name, list_binding_id, meta
        from public.linkedin_monitor_config
       where meta @> ${sql.json({ quick: true, entity_id, entity_type } as unknown as Parameters<typeof sql.json>[0])}::jsonb
       limit 1
    `;
    existingCfg = rows[0] ?? null;
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ ok: false, error: `config lookup: ${err.message}` }, { status: 500 });
  }

  let configId: string;
  let listId: ListId;
  let configName: string;

  if (existingCfg) {
    configId = existingCfg.id;
    configName = existingCfg.name;
    try {
      await sql`
        update public.linkedin_monitor_config
           set active     = true,
               meta       = ${sql.json({ quick: true, entity_id, entity_type } as unknown as Parameters<typeof sql.json>[0])},
               updated_at = now()
         where id = ${configId}
      `;
    } catch (e) {
      const err = dbError(e);
      return NextResponse.json({ ok: false, error: `reactivate config: ${err.message}` }, { status: 500 });
    }
    try {
      const rows = existingCfg.list_binding_id
        ? await sql<{ list_id: string }[]>`
            select list_id from public.list_binding where id = ${existingCfg.list_binding_id} limit 1
          `
        : [];
      listId = ((rows[0]?.list_id as ListId) ?? ("" as ListId));
    } catch {
      listId = "" as ListId;
    }
  } else {
    // Canonical `list` has no tags/meta columns — fold both into raw jsonb.
    const listResult = await createList({
      name: `LinkedIn watch: ${displayName}`,
      kind: "static",
      entity_types: [entity_type],
      description: `Auto-created by Monitor now button for ${entity_type} ${entity_id}`,
      raw: {
        tags: [QUICK_TAG, entity_type],
        quick: true,
        entity_id,
        entity_type,
      },
    });
    if (!listResult.ok) {
      return NextResponse.json({ ok: false, error: `list creation failed: ${listResult.error.kind}` }, { status: 500 });
    }
    listId = listResult.value.id as ListId;

    const memResult = await addMembers(listId, [
      { entity_type: entity_type as EntityType, entity_id: entity_id as EntityId, source: "manual" },
    ]);
    if (!memResult.ok) {
      return NextResponse.json({ ok: false, error: `add member failed: ${memResult.error.kind}` }, { status: 500 });
    }

    let bindingId: string;
    try {
      const rows = await sql<{ id: string }[]>`
        insert into public.list_binding
          (list_id, binding_type, active, honor_suppressions, config)
        values
          (${listId},
           ${"linkedin_monitor"},
           ${true},
           ${true},
           ${sql.json({} as unknown as Parameters<typeof sql.json>[0])})
        returning id
      `;
      if (rows.length === 0) throw new Error("no id returned");
      bindingId = rows[0].id;
    } catch (e) {
      const err = dbError(e);
      return NextResponse.json({ ok: false, error: `binding failed: ${err.message}` }, { status: 500 });
    }

    const fetchTypes = entity_type === "company" ? ["company_page"] : ["profile_public"];
    configName = `Watch: ${displayName}`;
    try {
      const rows = await sql<{ id: string }[]>`
        insert into public.linkedin_monitor_config
          (name, list_binding_id, fetch_types, cadence_seconds, jitter_seconds,
           batch_size, per_fetch_delay_ms, active, meta)
        values
          (${configName},
           ${bindingId},
           ${sql.array(fetchTypes)}::text[],
           ${21600},
           ${1800},
           ${5},
           ${60000},
           ${true},
           ${sql.json({ quick: true, entity_id, entity_type } as unknown as Parameters<typeof sql.json>[0])})
        returning id
      `;
      if (rows.length === 0) throw new Error("no id returned");
      configId = rows[0].id;
    } catch (e) {
      const err = dbError(e);
      return NextResponse.json({ ok: false, error: `config failed: ${err.message}` }, { status: 500 });
    }
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
