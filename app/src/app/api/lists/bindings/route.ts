// List binding picker for the LinkedIn monitor UI.
// Returns bindings with parent list info for display.
//
// Canonical: reads from `list_binding` joined to `list` (singular).

import { NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BindingRow = {
  id: string;
  binding_type: string;
  active: boolean;
  honor_suppressions: boolean;
  list_id: string;
  list_name: string | null;
  list_kind: string | null;
  list_entity_types: string[] | null;
};

export async function GET() {
  try {
    const rows = await sql<BindingRow[]>`
      select b.id,
             b.binding_type,
             b.active,
             b.honor_suppressions,
             b.list_id,
             l.name         as list_name,
             l.kind         as list_kind,
             l.entity_types as list_entity_types
        from public.list_binding b
        left join public.list l on l.id = b.list_id
       where b.active = true
       order by b.created_at desc
    `;
    // Preserve the previous nested shape callers expect:
    //   { id, binding_type, active, honor_suppressions, list_id,
    //     lists: { id, name, kind, entity_types } | null }
    const bindings = rows.map((r) => ({
      id: r.id,
      binding_type: r.binding_type,
      active: r.active,
      honor_suppressions: r.honor_suppressions,
      list_id: r.list_id,
      lists: r.list_name
        ? {
            id: r.list_id,
            name: r.list_name,
            kind: r.list_kind,
            entity_types: r.list_entity_types ?? [],
          }
        : null,
    }));
    return NextResponse.json({ bindings });
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}
