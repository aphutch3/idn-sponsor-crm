// CRUD for linkedin_monitor_config — used by the admin UI at /linkedin-monitor.
// Open (like the rest of the CRM admin surface). Server-side only; no client-visible secrets.
// Canonical singular: public.linkedin_monitor_config.

import { NextRequest, NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_TYPES = new Set([
  "company_page",
  "company_posts",
  "company_people",
  "profile_public",
  "profile_activity",
]);

type ConfigRow = Record<string, unknown> & { list_binding_id: string | null };

export async function GET() {
  try {
    const configs = await sql<ConfigRow[]>`
      select *
        from public.linkedin_monitor_config
       order by created_at desc
    `;

    // Batch-load the joined bindings + lists (mimics Supabase nested embed).
    const bindingIds = Array.from(
      new Set(configs.map((c) => c.list_binding_id).filter((v): v is string => !!v)),
    );

    let bindingById = new Map<string, unknown>();
    if (bindingIds.length > 0) {
      const bindings = await sql<Array<{
        id: string;
        list_id: string;
        binding_type: string;
        honor_suppressions: boolean;
        list_name: string | null;
        list_kind: string | null;
        list_entity_types: string[] | null;
      }>>`
        select b.id, b.list_id, b.binding_type, b.honor_suppressions,
               l.name         as list_name,
               l.kind         as list_kind,
               l.entity_types as list_entity_types
          from public.list_binding b
          left join public.list l on l.id = b.list_id
         where b.id in ${sql(bindingIds)}
      `;
      bindingById = new Map(
        bindings.map((b) => [b.id, {
          id: b.id,
          list_id: b.list_id,
          binding_type: b.binding_type,
          honor_suppressions: b.honor_suppressions,
          lists: b.list_id
            ? {
                id: b.list_id,
                name: b.list_name,
                kind: b.list_kind,
                entity_types: b.list_entity_types,
              }
            : null,
        }]),
      );
    }

    const shaped = configs.map((c) => ({
      ...c,
      list_bindings: c.list_binding_id ? bindingById.get(c.list_binding_id) ?? null : null,
    }));
    return NextResponse.json({ configs: shaped });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
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

  try {
    const rows = await sql`
      insert into public.linkedin_monitor_config
        (name, list_binding_id, fetch_types, cadence_seconds, jitter_seconds,
         batch_size, per_fetch_delay_ms, active)
      values
        (${body.name.trim()},
         ${body.list_binding_id ?? null},
         ${sql.array(fetchTypes)}::text[],
         ${body.cadence_seconds ?? 21600},
         ${body.jitter_seconds ?? 1800},
         ${body.batch_size ?? 15},
         ${body.per_fetch_delay_ms ?? 60000},
         ${body.active ?? true})
      returning *
    `;
    return NextResponse.json({ config: rows[0] });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
