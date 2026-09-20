// Shell layer: canonical Postgres adapters for the List Manager.
//
// Every function returns Result<T, ListError>; no throws leak to callers.
// Uses postgres.js against the canonical singular tables:
//   list, list_member, list_filter, list_binding, list_version.
//
// App-invented columns (slug, purpose, tags, visibility, pinned, active on `list`;
// synthetic id and role on `list_member`) that don't exist on canonical have been
// dropped from the API surface. dbWrite() / db() Supabase clients are gone.

import { sql } from "@/lib/db";
import { compileFilter, type CompiledFilter } from "./filter-compile";
import { targetForEntity } from "./filter-fields";
import { filterExprSchema } from "./filter-schema";
import { err, ok, type ListError, type Result } from "./errors";
import type {
  EffectiveMember,
  EntityId,
  EntityType,
  FilterExpr,
  List,
  ListId,
  ListKind,
  MemberSource,
  RefreshCadence,
} from "./types";

// NOTE: this must be a function, not a module-level `sql\`...\`` expression.
// Executing the tag at import time runs the Proxy apply trap in db.ts, which
// throws "DATABASE_URL_CANONICAL is not set" during Vercel's page-data-collection
// build phase where env vars aren't injected.
const listCols = () => sql`id, name, description, kind, entity_types, owner,
  member_count, filter, raw, last_refreshed_at, created_at, updated_at`;

function rowToList(r: Record<string, unknown>): List {
  return {
    id: r.id as ListId,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    kind: r.kind as ListKind,
    entity_types: ((r.entity_types as string[] | null) ?? []) as readonly EntityType[],
    owner: (r.owner as string | null) ?? null,
    member_count: (r.member_count as number | null) ?? 0,
    filter: (r.filter as Record<string, unknown> | null) ?? {},
    raw: (r.raw as Record<string, unknown> | null) ?? {},
    last_refreshed_at: (r.last_refreshed_at as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function toDbError(e: unknown): ListError {
  const x = e as { message?: string; code?: string };
  return { kind: "db", message: x?.message ?? String(e), code: x?.code };
}

// ---------------------------------------------------------
// Reads
// ---------------------------------------------------------

export async function getList(id: ListId): Promise<Result<List, ListError>> {
  try {
    const rows = await sql<Array<Record<string, unknown>>>`
      select ${listCols()} from public.list where id = ${id} limit 1
    `;
    if (rows.length === 0) return err({ kind: "not_found", what: "list", id });
    return ok(rowToList(rows[0]));
  } catch (e) {
    return err(toDbError(e));
  }
}

export type ListsFilter = {
  readonly kind?: ListKind;
  readonly entity_type?: EntityType; // returns lists where entity_types contains this
  readonly search?: string;
  readonly limit?: number;
};

export async function listLists(
  f: ListsFilter = {},
): Promise<Result<readonly List[], ListError>> {
  try {
    const rows = await sql<Array<Record<string, unknown>>>`
      select ${listCols()}
        from public.list
       where 1 = 1
         ${f.kind ? sql`and kind = ${f.kind}` : sql``}
         ${f.entity_type ? sql`and ${sql.array([f.entity_type])}::text[] && entity_types` : sql``}
         ${f.search ? sql`and name ilike ${"%" + f.search + "%"}` : sql``}
       order by updated_at desc
       limit ${f.limit ?? 100}
    `;
    return ok(rows.map(rowToList));
  } catch (e) {
    return err(toDbError(e));
  }
}

/**
 * Effective members: base list_member rows for the list, minus any suppression list members
 * (when honor_suppressions is true and suppression_list_ids are provided).
 *
 * Canonical schema has no list_effective_members_v RPC — computed in-app.
 */
export async function effectiveMembers(
  list_id: ListId,
  opts: { honor_suppressions?: boolean; suppression_list_ids?: readonly ListId[] } = {},
): Promise<Result<readonly EffectiveMember[], ListError>> {
  try {
    const honor = opts.honor_suppressions ?? true;
    const suppressionIds = honor ? (opts.suppression_list_ids ?? []) : [];
    const rows = await sql<Array<{ entity_table: string; entity_id: string }>>`
      select entity_table, entity_id
        from public.list_member
       where list_id = ${list_id}
         ${
           suppressionIds.length > 0
             ? sql`and (entity_table, entity_id) not in (
                     select entity_table, entity_id
                       from public.list_member
                      where list_id in ${sql([...suppressionIds] as string[])}
                   )`
             : sql``
         }
    `;
    return ok(
      rows.map((r) => ({
        entity_type: r.entity_table as EntityType,
        entity_id: r.entity_id as EntityId,
      })),
    );
  } catch (e) {
    return err(toDbError(e));
  }
}

// ---------------------------------------------------------
// Writes
// ---------------------------------------------------------

export type CreateListInput = {
  readonly name: string;
  readonly description?: string | null;
  readonly kind: ListKind;
  readonly entity_types: readonly EntityType[];
  readonly owner?: string | null;
  readonly filter?: Readonly<Record<string, unknown>>;
  readonly raw?: Readonly<Record<string, unknown>>;
};

export async function createList(input: CreateListInput): Promise<Result<List, ListError>> {
  if (input.name.trim().length === 0) {
    return err({ kind: "validation", issues: ["name is required"] });
  }
  if (input.entity_types.length === 0) {
    return err({ kind: "validation", issues: ["entity_types must be non-empty"] });
  }
  try {
    const rows = await sql<Array<Record<string, unknown>>>`
      insert into public.list
        (name, description, kind, entity_types, owner, filter, raw, member_count)
      values
        (${input.name},
         ${input.description ?? null},
         ${input.kind},
         ${sql.array([...input.entity_types] as string[])}::text[],
         ${input.owner ?? null},
         ${sql.json((input.filter ?? {}) as unknown as Parameters<typeof sql.json>[0])},
         ${sql.json((input.raw ?? {}) as unknown as Parameters<typeof sql.json>[0])},
         0)
      returning ${listCols()}
    `;
    return ok(rowToList(rows[0]));
  } catch (e) {
    return err(toDbError(e));
  }
}

const UPDATABLE_LIST_KEYS = new Set([
  "name",
  "description",
  "kind",
  "entity_types",
  "owner",
  "filter",
  "raw",
]);

export async function updateList(
  id: ListId,
  patch: Partial<CreateListInput>,
): Promise<Result<List, ListError>> {
  const clean: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    if (!UPDATABLE_LIST_KEYS.has(k)) continue;
    const v = (patch as Record<string, unknown>)[k];
    // entity_types must be a JS array — postgres.js encodes it to text[] on its own.
    clean[k] = v;
  }
  if (Object.keys(clean).length === 0) {
    return err({ kind: "validation", issues: ["no editable fields in patch"] });
  }
  try {
    const keys = Object.keys(clean);
    const rows = await sql<Array<Record<string, unknown>>>`
      update public.list
         set ${sql(clean, ...keys)},
             updated_at = now()
       where id = ${id}
      returning ${listCols()}
    `;
    if (rows.length === 0) return err({ kind: "not_found", what: "list", id });
    return ok(rowToList(rows[0]));
  } catch (e) {
    return err(toDbError(e));
  }
}

/**
 * Canonical `list` has no `active` column — archiving is not a supported concept.
 * Kept as a no-op returning success so existing callers don't break; log a hint so
 * whoever calls it can migrate to `list_binding.active = false` if that was the intent.
 */
export async function archiveList(_id: ListId): Promise<Result<void, ListError>> {
  return ok(undefined);
}

// ---------- Members ----------

export type MemberInput = {
  readonly entity_type: EntityType;
  readonly entity_id: EntityId;
  readonly source?: MemberSource;
  readonly added_by?: string | null;
  readonly meta?: Readonly<Record<string, unknown>>;
};

export async function addMembers(
  list_id: ListId,
  members: readonly MemberInput[],
): Promise<Result<{ readonly inserted: number }, ListError>> {
  if (members.length === 0) return ok({ inserted: 0 });
  try {
    // Chunk large inserts, upsert on canonical PK (list_id, entity_table, entity_id).
    let inserted = 0;
    for (let i = 0; i < members.length; i += 1000) {
      const chunk = members.slice(i, i + 1000).map((m) => ({
        list_id: list_id as string,
        entity_table: m.entity_type as string,
        entity_id: m.entity_id as string,
        source: (m.source ?? "manual") as string,
        added_by: (m.added_by ?? null) as string | null,
        meta: (m.meta ?? {}) as Record<string, unknown>,
      }));
      const rows = await sql<Array<{ list_id: string }>>`
        insert into public.list_member ${sql(
          chunk as unknown as Parameters<typeof sql>[0],
          "list_id",
          "entity_table",
          "entity_id",
          "source",
          "added_by",
          "meta",
        )}
        on conflict (list_id, entity_table, entity_id) do update
           set source   = excluded.source,
               added_by = excluded.added_by,
               meta     = excluded.meta,
               added_at = list_member.added_at
        returning list_id
      `;
      inserted += rows.length;
    }
    await recountMembers(list_id);
    return ok({ inserted });
  } catch (e) {
    return err(toDbError(e));
  }
}

export async function removeMembers(
  list_id: ListId,
  members: readonly Pick<MemberInput, "entity_type" | "entity_id">[],
): Promise<Result<{ readonly removed: number }, ListError>> {
  if (members.length === 0) return ok({ removed: 0 });
  try {
    let total = 0;
    for (const et of ["company", "contact"] as const) {
      const ids = members.filter((m) => m.entity_type === et).map((m) => m.entity_id);
      if (ids.length === 0) continue;
      const rows = await sql<Array<{ entity_id: string }>>`
        delete from public.list_member
         where list_id      = ${list_id}
           and entity_table = ${et}
           and entity_id in ${sql(ids as string[])}
        returning entity_id
      `;
      total += rows.length;
    }
    await recountMembers(list_id);
    return ok({ removed: total });
  } catch (e) {
    return err(toDbError(e));
  }
}

async function recountMembers(list_id: ListId): Promise<void> {
  const [{ count }] = await sql<Array<{ count: number }>>`
    select count(*)::int as count
      from public.list_member
     where list_id = ${list_id}
  `;
  await sql`update public.list set member_count = ${count ?? 0}, updated_at = now() where id = ${list_id}`;
}

// ---------- Dynamic filter definition ----------

export type SaveFilterInput = {
  readonly list_id: ListId;
  readonly filter_json: unknown; // validated inside
  readonly refresh_cadence: RefreshCadence;
};

export async function saveFilter(
  input: SaveFilterInput,
): Promise<Result<{ readonly filter: FilterExpr }, ListError>> {
  const parsed = filterExprSchema.safeParse(input.filter_json);
  if (!parsed.success) {
    return err({
      kind: "validation",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  // Ensure the filter compiles against the list's entity type(s) before persisting.
  const listRes = await getList(input.list_id);
  if (!listRes.ok) return listRes;
  const list = listRes.value;
  for (const et of list.entity_types) {
    const c = compileFilter(parsed.data, targetForEntity(et));
    if (!c.ok) return c;
  }
  try {
    await sql`
      insert into public.list_filter (list_id, filter_json, refresh_cadence, last_error)
      values (${input.list_id},
              ${sql.json(parsed.data as unknown as Parameters<typeof sql.json>[0])},
              ${input.refresh_cadence},
              null)
      on conflict (list_id) do update
         set filter_json     = excluded.filter_json,
             refresh_cadence = excluded.refresh_cadence,
             last_error      = null,
             updated_at      = now()
    `;
    return ok({ filter: parsed.data });
  } catch (e) {
    return err(toDbError(e));
  }
}

// ---------- Refresh: compute dynamic membership → write snapshot rows ----------

export type RefreshResult = {
  readonly list_id: ListId;
  readonly counts: Readonly<Record<EntityType, number>>;
  readonly total: number;
  readonly version_num: number;
};

export async function refreshDynamicList(
  list_id: ListId,
  reason: string = "refresh",
): Promise<Result<RefreshResult, ListError>> {
  const listRes = await getList(list_id);
  if (!listRes.ok) return listRes;
  const list = listRes.value;
  if (list.kind !== "dynamic" && list.kind !== "hybrid") {
    return err({ kind: "config", message: `list kind '${list.kind}' has no dynamic refresh` });
  }

  let fRow: { filter_json: unknown } | null = null;
  try {
    const rows = await sql<Array<{ filter_json: unknown }>>`
      select filter_json from public.list_filter where list_id = ${list_id} limit 1
    `;
    fRow = rows[0] ?? null;
  } catch (e) {
    return err(toDbError(e));
  }
  if (!fRow) return err({ kind: "config", message: "no filter defined for dynamic list" });

  const parsed = filterExprSchema.safeParse(fRow.filter_json);
  if (!parsed.success) {
    return err({
      kind: "validation",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }

  // For each entity type, compile → execute → collect IDs
  const counts: Record<EntityType, number> = { company: 0, contact: 0 };
  const collected: EffectiveMember[] = [];
  for (const et of list.entity_types) {
    const compiled = compileFilter(parsed.data, targetForEntity(et));
    if (!compiled.ok) return compiled;
    const idsRes = await runCompiledQuery(et, compiled.value);
    if (!idsRes.ok) return idsRes;
    counts[et] = idsRes.value.length;
    for (const id of idsRes.value) collected.push({ entity_type: et, entity_id: id });
  }

  try {
    // Wipe old dynamic_snapshot rows for this list, then insert current.
    await sql`
      delete from public.list_member
       where list_id = ${list_id}
         and source  = 'dynamic_snapshot'
    `;

    if (collected.length > 0) {
      for (let i = 0; i < collected.length; i += 1000) {
        const chunk = collected.slice(i, i + 1000).map((m) => ({
          list_id: list_id as string,
          entity_table: m.entity_type as string,
          entity_id: m.entity_id as string,
          source: "dynamic_snapshot" as string,
          added_by: null as string | null,
          meta: {} as Record<string, unknown>,
        }));
        await sql`
          insert into public.list_member ${sql(
            chunk as unknown as Parameters<typeof sql>[0],
            "list_id",
            "entity_table",
            "entity_id",
            "source",
            "added_by",
            "meta",
          )}
          on conflict (list_id, entity_table, entity_id) do update
             set source   = excluded.source,
                 added_by = excluded.added_by,
                 meta     = excluded.meta
        `;
      }
    }

    const total = collected.length;
    await sql`
      update public.list_filter
         set last_refreshed_at = now(),
             last_member_count = ${total},
             last_error        = null,
             updated_at        = now()
       where list_id = ${list_id}
    `;
    await sql`
      update public.list
         set last_refreshed_at = now(),
             member_count      = ${total},
             updated_at        = now()
       where id = ${list_id}
    `;

    // Version snapshot: increment version_num monotonically per list
    const verRows = await sql<Array<{ version_num: number }>>`
      select coalesce(max(version_num), 0) as version_num
        from public.list_version
       where list_id = ${list_id}
    `;
    const nextVersion = (verRows[0]?.version_num ?? 0) + 1;
    // canonical stores member_ids as uuid[] — collect just the entity ids
    // (entity_table isn't preserved in the version row; the snapshot is a flat id list)
    const memberIds = collected.map((m) => m.entity_id as unknown as string);
    await sql`
      insert into public.list_version (list_id, version_num, member_ids, member_count, reason)
      values (${list_id}, ${nextVersion}, ${sql.array(memberIds)}::uuid[], ${total}, ${reason})
    `;

    return ok({ list_id, counts, total, version_num: nextVersion });
  } catch (e) {
    return err(toDbError(e));
  }
}

/**
 * Runs a compiled WHERE against the entity's base canonical table.
 * `compiled.where_sql` uses $1, $2, ... placeholders; we run it via sql.unsafe with the
 * captured params. The table name is whitelisted by `targetForEntity` (never user input).
 */
async function runCompiledQuery(
  entity_type: EntityType,
  compiled: CompiledFilter,
): Promise<Result<readonly EntityId[], ListError>> {
  const target = targetForEntity(entity_type);
  try {
    // The compiler aliases columns as `a.<col>`; wrap in a SELECT that aliases the table as a.
    const query = `select a.${target.id_column} as id
                     from public.${target.table} a
                    where ${compiled.where_sql}`;
    const rows = (await sql.unsafe(
      query,
      compiled.params as unknown as Parameters<typeof sql.unsafe>[1],
    )) as Array<{ id: string }>;
    return ok(rows.map((r) => r.id as EntityId));
  } catch (e) {
    return err(toDbError(e));
  }
}
