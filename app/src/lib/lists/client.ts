// Shell layer: Supabase adapters for the List Manager.
// Every function returns Result<T, ListError>; no throws leak to callers.
// Uses dbWrite() for mutations (service role required); db() for reads.

import { db, dbWrite } from "@/lib/supabase";
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
  MemberRole,
  MemberSource,
  RefreshCadence,
  Visibility,
} from "./types";

// ---------------------------------------------------------
// Reads
// ---------------------------------------------------------

export async function getList(id: ListId): Promise<Result<List, ListError>> {
  const { data, error } = await db()
    .from("lists")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return err({ kind: "db", message: error.message, code: error.code });
  if (!data) return err({ kind: "not_found", what: "list", id });
  return ok(data as unknown as List);
}

export type ListsFilter = {
  readonly purpose?: string;
  readonly kind?: ListKind;
  readonly active?: boolean;
  readonly entity_type?: EntityType; // returns lists where entity_types contains this
  readonly tags_any?: readonly string[];
  readonly search?: string;
  readonly limit?: number;
};

export async function listLists(
  f: ListsFilter = {},
): Promise<Result<readonly List[], ListError>> {
  let q = db().from("lists").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false });
  if (f.purpose !== undefined) q = q.eq("purpose", f.purpose);
  if (f.kind !== undefined) q = q.eq("kind", f.kind);
  if (f.active !== undefined) q = q.eq("active", f.active);
  if (f.entity_type !== undefined) q = q.contains("entity_types", [f.entity_type]);
  if (f.tags_any && f.tags_any.length > 0) q = q.overlaps("tags", f.tags_any as string[]);
  if (f.search) q = q.ilike("name", `%${f.search}%`);
  q = q.limit(f.limit ?? 100);
  const { data, error } = await q;
  if (error) return err({ kind: "db", message: error.message, code: error.code });
  return ok((data ?? []) as unknown as List[]);
}

/** Effective members using the DB function; single source of truth for consumers. */
export async function effectiveMembers(
  list_id: ListId,
  opts: { honor_suppressions?: boolean; suppression_list_ids?: readonly ListId[] } = {},
): Promise<Result<readonly EffectiveMember[], ListError>> {
  // service_role-only RPC — keep effective-member reads scoped to server-side callers
  const { data, error } = await dbWrite().rpc("list_effective_members_v", {
    p_list_id: list_id,
    p_honor_suppressions: opts.honor_suppressions ?? true,
    p_suppression_list_ids: (opts.suppression_list_ids as string[] | undefined) ?? null,
  });
  if (error) return err({ kind: "db", message: error.message, code: error.code });
  return ok((data ?? []) as unknown as EffectiveMember[]);
}

// ---------------------------------------------------------
// Writes
// ---------------------------------------------------------

export type CreateListInput = {
  readonly name: string;
  readonly slug?: string | null;
  readonly description?: string | null;
  readonly kind: ListKind;
  readonly entity_types: readonly EntityType[];
  readonly purpose?: string | null;
  readonly tags?: readonly string[];
  readonly owner?: string | null;
  readonly visibility?: Visibility;
  readonly pinned?: boolean;
  readonly meta?: Readonly<Record<string, unknown>>;
};

export async function createList(input: CreateListInput): Promise<Result<List, ListError>> {
  if (input.name.trim().length === 0) {
    return err({ kind: "validation", issues: ["name is required"] });
  }
  if (input.entity_types.length === 0) {
    return err({ kind: "validation", issues: ["entity_types must be non-empty"] });
  }
  const { data, error } = await dbWrite()
    .from("lists")
    .insert({
      name: input.name,
      slug: input.slug ?? null,
      description: input.description ?? null,
      kind: input.kind,
      entity_types: input.entity_types,
      purpose: input.purpose ?? null,
      tags: input.tags ?? [],
      owner: input.owner ?? null,
      visibility: input.visibility ?? "team",
      pinned: input.pinned ?? false,
      meta: input.meta ?? {},
    })
    .select("*")
    .single();
  if (error) return err({ kind: "db", message: error.message, code: error.code });
  return ok(data as unknown as List);
}

export async function updateList(
  id: ListId,
  patch: Partial<CreateListInput> & { readonly active?: boolean },
): Promise<Result<List, ListError>> {
  const { data, error } = await dbWrite()
    .from("lists")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err({ kind: "db", message: error.message, code: error.code });
  return ok(data as unknown as List);
}

export async function archiveList(id: ListId): Promise<Result<void, ListError>> {
  const { error } = await dbWrite().from("lists").update({ active: false }).eq("id", id);
  if (error) return err({ kind: "db", message: error.message, code: error.code });
  return ok(undefined);
}

// ---------- Members ----------

export type MemberInput = {
  readonly entity_type: EntityType;
  readonly entity_id: EntityId;
  readonly role?: MemberRole;
  readonly source?: MemberSource;
  readonly added_by?: string | null;
  readonly meta?: Readonly<Record<string, unknown>>;
};

export async function addMembers(
  list_id: ListId,
  members: readonly MemberInput[],
): Promise<Result<{ readonly inserted: number }, ListError>> {
  if (members.length === 0) return ok({ inserted: 0 });
  const rows = members.map((m) => ({
    list_id,
    entity_type: m.entity_type,
    entity_id: m.entity_id,
    role: m.role ?? "include",
    source: m.source ?? "manual",
    added_by: m.added_by ?? null,
    meta: m.meta ?? {},
  }));
  const { error, count } = await dbWrite()
    .from("list_members")
    .upsert(rows, { onConflict: "list_id,entity_type,entity_id", ignoreDuplicates: false, count: "exact" });
  if (error) return err({ kind: "db", message: error.message, code: error.code });
  await recountMembers(list_id);
  return ok({ inserted: count ?? rows.length });
}

export async function removeMembers(
  list_id: ListId,
  members: readonly Pick<MemberInput, "entity_type" | "entity_id">[],
): Promise<Result<{ readonly removed: number }, ListError>> {
  if (members.length === 0) return ok({ removed: 0 });
  // Supabase can't do composite IN cleanly; loop by entity_type
  let total = 0;
  for (const et of ["company", "contact"] as const) {
    const ids = members.filter((m) => m.entity_type === et).map((m) => m.entity_id);
    if (ids.length === 0) continue;
    const { error, count } = await dbWrite()
      .from("list_members")
      .delete({ count: "exact" })
      .eq("list_id", list_id)
      .eq("entity_type", et)
      .in("entity_id", ids as string[]);
    if (error) return err({ kind: "db", message: error.message, code: error.code });
    total += count ?? 0;
  }
  await recountMembers(list_id);
  return ok({ removed: total });
}

async function recountMembers(list_id: ListId): Promise<void> {
  const { count } = await db()
    .from("list_members")
    .select("id", { count: "exact", head: true })
    .eq("list_id", list_id)
    .eq("role", "include");
  await dbWrite().from("lists").update({ member_count: count ?? 0 }).eq("id", list_id);
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
  const { error } = await dbWrite()
    .from("list_filters")
    .upsert(
      {
        list_id: input.list_id,
        filter_json: parsed.data,
        refresh_cadence: input.refresh_cadence,
        last_error: null,
      },
      { onConflict: "list_id" },
    );
  if (error) return err({ kind: "db", message: error.message, code: error.code });
  return ok({ filter: parsed.data });
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

  const { data: fRow, error: fErr } = await db()
    .from("list_filters")
    .select("*")
    .eq("list_id", list_id)
    .maybeSingle();
  if (fErr) return err({ kind: "db", message: fErr.message, code: fErr.code });
  if (!fRow) return err({ kind: "config", message: "no filter defined for dynamic list" });

  const parsed = filterExprSchema.safeParse((fRow as { filter_json: unknown }).filter_json);
  if (!parsed.success) {
    return err({
      kind: "validation",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }

  // For each entity type, compile → execute via RPC → collect IDs
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

  // Wipe old dynamic_snapshot rows for this list, then insert current
  const delErr = await dbWrite()
    .from("list_members")
    .delete()
    .eq("list_id", list_id)
    .eq("source", "dynamic_snapshot")
    .then((r) => r.error);
  if (delErr) return err({ kind: "db", message: delErr.message, code: delErr.code });

  if (collected.length > 0) {
    const rows = collected.map((m) => ({
      list_id,
      entity_type: m.entity_type,
      entity_id: m.entity_id,
      role: "include",
      source: "dynamic_snapshot",
    }));
    // Insert in chunks of 1000 for large lists
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      const { error: insErr } = await dbWrite()
        .from("list_members")
        .upsert(chunk, { onConflict: "list_id,entity_type,entity_id" });
      if (insErr) return err({ kind: "db", message: insErr.message, code: insErr.code });
    }
  }

  const total = collected.length;
  const now = new Date().toISOString();
  await dbWrite()
    .from("list_filters")
    .update({ last_refreshed_at: now, last_member_count: total, last_error: null })
    .eq("list_id", list_id);
  await dbWrite()
    .from("lists")
    .update({ last_refreshed_at: now, member_count: total })
    .eq("id", list_id);

  // Version snapshot
  const { data: verRow } = await db()
    .from("list_versions")
    .select("version_num")
    .eq("list_id", list_id)
    .order("version_num", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next_version = ((verRow as { version_num?: number } | null)?.version_num ?? 0) + 1;
  await dbWrite().from("list_versions").insert({
    list_id,
    version_num: next_version,
    member_ids: collected,
    member_count: total,
    reason,
  });

  return ok({ list_id, counts, total, version_num: next_version });
}

/** Runs a compiled WHERE against the entity's base table via a Postgres function. */
async function runCompiledQuery(
  entity_type: EntityType,
  compiled: CompiledFilter,
): Promise<Result<readonly EntityId[], ListError>> {
  // Supabase RPC can't take a raw SQL fragment safely, so we use a purpose-built RPC
  // (created in a follow-up migration) that accepts the compiled where + params.
  // For now we execute via the SQL execution RPC pattern used by other endpoints:
  //   SELECT id FROM {table} WHERE {where_sql}
  // Since Supabase JS client can't run arbitrary SQL directly, we rely on the
  // `exec_list_filter` RPC (added in migration 002) which whitelists the entity table.
  const target = targetForEntity(entity_type);
  // service_role RPC — must use dbWrite() for execution
  const { data, error } = await dbWrite().rpc("exec_list_filter", {
    p_table: target.table,
    p_where_sql: compiled.where_sql,
    p_params: compiled.params as unknown[],
  });
  if (error) return err({ kind: "db", message: error.message, code: error.code });
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id as EntityId);
  return ok(ids);
}
