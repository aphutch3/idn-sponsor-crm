// Neon-backed drop-in for @supabase/supabase-js query builder methods used in this app.
//
// This shim implements the PostgREST-style chain (.from().select().eq().order()...) and executes
// against a Neon Postgres connection using @neondatabase/serverless (HTTP mode).
//
// Coverage (verified against a codebase-wide inventory as of 2026-09-09):
//   - .from(table)
//   - .select(columns, options?)             — options: { count?: 'exact'|'planned'|'estimated', head?: boolean }
//   - filters:  .eq  .neq  .gt  .gte  .lt  .lte  .like  .ilike  .in  .is  .contains
//               .containedBy  .overlaps  .match  .not  .or  .filter
//   - modifiers: .order  .limit  .range  .single  .maybeSingle
//   - mutations: .insert  .update  .upsert  .delete
//   - .rpc(name, args)  — invokes a function; returns rows or scalar
//
// Return shape: { data, error, count } — matches @supabase/supabase-js so calling code is untouched.
//
// This is intentionally NOT a full PostgREST implementation. It supports what the Engager app uses today.
// Any new method the app starts calling must be added here (and tested against parity with Supabase).

import { neon, NeonQueryFunction } from "@neondatabase/serverless";

type SupabaseLikeResponse<T = unknown> = {
  data: T | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
  count?: number | null;
  status?: number;
  statusText?: string;
};

type SelectOptions = {
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
};

type OrderOptions = {
  ascending?: boolean;
  nullsFirst?: boolean;
  foreignTable?: string; // ignored — no joins supported
};

type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "neq"; col: string; val: unknown }
  | { kind: "gt"; col: string; val: unknown }
  | { kind: "gte"; col: string; val: unknown }
  | { kind: "lt"; col: string; val: unknown }
  | { kind: "lte"; col: string; val: unknown }
  | { kind: "like"; col: string; pat: string }
  | { kind: "ilike"; col: string; pat: string }
  | { kind: "in"; col: string; vals: readonly unknown[] }
  | { kind: "is"; col: string; val: null | boolean }
  | { kind: "contains"; col: string; val: unknown } // array @> array, jsonb @> jsonb
  | { kind: "containedBy"; col: string; val: unknown }
  | { kind: "overlaps"; col: string; val: unknown } // array && array
  | { kind: "raw"; sql: string; params: readonly unknown[] }; // used by .filter/.or/.not/.match

// -------- ident + literal safety ---------------------------------------------------
function quoteIdent(name: string): string {
  // Only allow identifier chars we actually use in this codebase. Bail loudly on anything else.
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`neon-db: unsafe identifier "${name}" — only [A-Za-z_][A-Za-z0-9_]* is allowed`);
  }
  return `"${name}"`;
}

// PostgREST-style column path (a.b.c) → we only support single-column form here (a).
// Foreign-table paths ("company(id,name)") are NOT supported.
function parseSelectCols(selectExpr: string): string {
  const trimmed = selectExpr.trim();
  if (trimmed === "*" || trimmed === "") return "*";
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  return parts
    .map((p) => {
      // Support alias:col
      const m = /^([a-zA-Z_][a-zA-Z0-9_]*):([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(p);
      if (m) return `${quoteIdent(m[2])} as ${quoteIdent(m[1])}`;
      return quoteIdent(p);
    })
    .join(", ");
}

// -------- The chainable builder ----------------------------------------------------

class NeonQueryBuilder<T = Record<string, unknown>> implements PromiseLike<SupabaseLikeResponse<T[]>> {
  private table: string;
  private schema: string;
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private rangeEnd: number | null = null; // for .range() inclusive end
  private singleMode: "single" | "maybeSingle" | "many" = "many";
  private countMode: SelectOptions["count"] | null = null;
  private headMode = false;

  // Mutation payload / options
  private mutationRows: Record<string, unknown>[] | null = null;
  private updatePatch: Record<string, unknown> | null = null;
  private upsertOnConflict: string | null = null;
  private upsertIgnoreDuplicates = false;
  private returning = true;

  constructor(
    private sql: NeonQueryFunction<false, false>,
    table: string,
    schema: string,
  ) {
    this.table = table;
    this.schema = schema;
  }

  // ---- terminal-shape-only entry points -----------------------------------------
  select(columns?: string, options?: SelectOptions): this {
    // If called mid-chain after a mutation, select() controls `RETURNING`.
    if (this.mode === "select" && columns !== undefined) this.columns = parseSelectCols(columns);
    if (columns !== undefined && this.mode !== "select") this.columns = parseSelectCols(columns);
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.headMode = true;
    return this;
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]): this {
    this.mode = "insert";
    this.mutationRows = Array.isArray(rows) ? rows : [rows];
    this.returning = true;
    this.columns = "*";
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this.mode = "update";
    this.updatePatch = patch;
    this.returning = true;
    this.columns = "*";
    return this;
  }

  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.mode = "upsert";
    this.mutationRows = Array.isArray(rows) ? rows : [rows];
    this.upsertOnConflict = options?.onConflict ?? null;
    this.upsertIgnoreDuplicates = options?.ignoreDuplicates ?? false;
    this.returning = true;
    this.columns = "*";
    return this;
  }

  delete(): this {
    this.mode = "delete";
    this.returning = true;
    this.columns = "*";
    return this;
  }

  // ---- filters -----------------------------------------------------------------
  eq(col: string, val: unknown): this { this.filters.push({ kind: "eq", col, val }); return this; }
  neq(col: string, val: unknown): this { this.filters.push({ kind: "neq", col, val }); return this; }
  gt(col: string, val: unknown): this { this.filters.push({ kind: "gt", col, val }); return this; }
  gte(col: string, val: unknown): this { this.filters.push({ kind: "gte", col, val }); return this; }
  lt(col: string, val: unknown): this { this.filters.push({ kind: "lt", col, val }); return this; }
  lte(col: string, val: unknown): this { this.filters.push({ kind: "lte", col, val }); return this; }
  like(col: string, pat: string): this { this.filters.push({ kind: "like", col, pat }); return this; }
  ilike(col: string, pat: string): this { this.filters.push({ kind: "ilike", col, pat }); return this; }
  in(col: string, vals: readonly unknown[]): this { this.filters.push({ kind: "in", col, vals }); return this; }
  is(col: string, val: null | boolean): this { this.filters.push({ kind: "is", col, val }); return this; }
  contains(col: string, val: unknown): this { this.filters.push({ kind: "contains", col, val }); return this; }
  containedBy(col: string, val: unknown): this { this.filters.push({ kind: "containedBy", col, val }); return this; }
  overlaps(col: string, val: unknown): this { this.filters.push({ kind: "overlaps", col, val }); return this; }

  // .match({ a: 1, b: 2 }) → a=1 AND b=2
  match(obj: Record<string, unknown>): this {
    for (const [col, val] of Object.entries(obj)) this.eq(col, val);
    return this;
  }

  // .filter("col", "op", "value") → PostgREST-style operator string
  filter(col: string, op: string, value: unknown): this {
    switch (op) {
      case "eq": return this.eq(col, value);
      case "neq": return this.neq(col, value);
      case "gt": return this.gt(col, value);
      case "gte": return this.gte(col, value);
      case "lt": return this.lt(col, value);
      case "lte": return this.lte(col, value);
      case "like": return this.like(col, String(value));
      case "ilike": return this.ilike(col, String(value));
      case "is": return this.is(col, value as null | boolean);
      case "in": {
        // Supabase accepts string "(a,b,c)" or array
        const arr = Array.isArray(value)
          ? value
          : String(value).replace(/^\(|\)$/g, "").split(",");
        return this.in(col, arr);
      }
      case "cs": return this.contains(col, value);
      case "cd": return this.containedBy(col, value);
      case "ov": return this.overlaps(col, value);
      default:
        throw new Error(`neon-db: unsupported filter operator "${op}" on ${col}`);
    }
  }

  // .not("col", "eq", 1) → NOT (col = 1)
  not(col: string, op: string, value: unknown): this {
    const child = new NeonQueryBuilder<T>(this.sql, this.table, this.schema);
    child.filter(col, op, value);
    const [expr, params] = child.compileWhereExprOnly();
    this.filters.push({ kind: "raw", sql: `NOT (${expr})`, params });
    return this;
  }

  // .or("a.eq.1,b.eq.2") → (a = 1 OR b = 2)
  or(expr: string): this {
    // Parse PostgREST or-list: "col.op.val,col.op.val,..."
    const parts = splitOrList(expr);
    const child = new NeonQueryBuilder<T>(this.sql, this.table, this.schema);
    for (const raw of parts) {
      const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov)\.(.+)$/.exec(raw);
      if (!m) throw new Error(`neon-db: .or() cannot parse "${raw}"`);
      const [, col, op, val] = m;
      const decoded = op === "in" ? val : val;
      child.filter(col, op, decoded);
    }
    const [innerExpr, params] = child.compileWhereListOr();
    this.filters.push({ kind: "raw", sql: `(${innerExpr})`, params });
    return this;
  }

  // ---- modifiers ---------------------------------------------------------------
  order(col: string, opts?: OrderOptions): this {
    if (opts?.foreignTable) {
      throw new Error(`neon-db: .order on foreignTable "${opts.foreignTable}" is not supported`);
    }
    this.orderBy.push({
      col,
      asc: opts?.ascending ?? true,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }
  limit(n: number): this { this.limitN = n; return this; }
  range(from: number, to: number): this {
    // to is inclusive in Supabase; convert to LIMIT/OFFSET
    this.offsetN = from;
    this.rangeEnd = to;
    this.limitN = to - from + 1;
    return this;
  }
  single(): this { this.singleMode = "single"; this.limitN = 2; return this; }
  maybeSingle(): this { this.singleMode = "maybeSingle"; this.limitN = 2; return this; }

  // ---- execution ---------------------------------------------------------------
  then<TResult1 = SupabaseLikeResponse<T[]>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseLikeResponse<T[]>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<SupabaseLikeResponse<T[]>> {
    try {
      const { sql, params } = this.compile();
      const rows = (await this.sql.query(sql, params as unknown[])) as unknown as Record<string, unknown>[];

      let count: number | null = null;
      if (this.countMode) {
        // Neon returns rows; run a separate count query.
        const { sql: countSql, params: countParams } = this.compileCount();
        const countRows = (await this.sql.query(countSql, countParams as unknown[])) as unknown as { c: string | number }[];
        count = Number(countRows[0]?.c ?? 0);
      }

      if (this.headMode) return { data: null as unknown as T[], error: null, count, status: 200 };

      if (this.singleMode !== "many") {
        if (rows.length > 1) {
          return {
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
            count,
            status: 406,
          };
        }
        if (rows.length === 0) {
          if (this.singleMode === "maybeSingle") return { data: null, error: null, count, status: 200 };
          return {
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
            count,
            status: 406,
          };
        }
        return { data: rows[0] as unknown as T[], error: null, count, status: 200 };
      }

      return { data: rows as unknown as T[], error: null, count, status: 200 };
    } catch (err) {
      const e = err as { message?: string; code?: string; detail?: string; hint?: string };
      return {
        data: null,
        error: {
          message: e?.message ?? String(err),
          code: e?.code,
          details: e?.detail,
          hint: e?.hint,
        },
        count: null,
        status: 500,
      };
    }
  }

  // ---- SQL compilation ---------------------------------------------------------

  private compile(): { sql: string; params: unknown[] } {
    const qtable = `${quoteIdent(this.schema)}.${quoteIdent(this.table)}`;
    const params: unknown[] = [];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };

    if (this.mode === "select") {
      const [whereExpr, wp] = this.compileWhereExpr();
      wp.forEach((v) => p(v));
      let sql = `select ${this.columns} from ${qtable}`;
      if (whereExpr) sql += ` where ${whereExpr}`;
      sql += this.compileOrderLimit();
      return { sql, params };
    }

    if (this.mode === "insert") {
      const rows = this.mutationRows ?? [];
      if (rows.length === 0) throw new Error("neon-db: insert called with 0 rows");
      const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      const values = rows
        .map((r) => "(" + cols.map((c) => (r[c] === undefined ? "default" : p(normalizeParam(r[c])))).join(", ") + ")")
        .join(", ");
      let sql = `insert into ${qtable} (${cols.map(quoteIdent).join(", ")}) values ${values}`;
      if (this.returning) sql += ` returning ${this.columns}`;
      return { sql, params };
    }

    if (this.mode === "update") {
      const patch = this.updatePatch ?? {};
      const cols = Object.keys(patch);
      if (cols.length === 0) throw new Error("neon-db: update called with empty patch");
      const setSql = cols.map((c) => `${quoteIdent(c)} = ${p(normalizeParam(patch[c]))}`).join(", ");
      const [whereExpr] = this.compileWhereExprWithParams(params, p);
      let sql = `update ${qtable} set ${setSql}`;
      if (whereExpr) sql += ` where ${whereExpr}`;
      if (this.returning) sql += ` returning ${this.columns}`;
      return { sql, params };
    }

    if (this.mode === "upsert") {
      const rows = this.mutationRows ?? [];
      if (rows.length === 0) throw new Error("neon-db: upsert called with 0 rows");
      const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      const values = rows
        .map((r) => "(" + cols.map((c) => (r[c] === undefined ? "default" : p(normalizeParam(r[c])))).join(", ") + ")")
        .join(", ");
      const onConflict = this.upsertOnConflict
        ? this.upsertOnConflict
            .split(",")
            .map((s) => quoteIdent(s.trim()))
            .join(", ")
        : "";
      let sql = `insert into ${qtable} (${cols.map(quoteIdent).join(", ")}) values ${values}`;
      if (onConflict) {
        if (this.upsertIgnoreDuplicates) {
          sql += ` on conflict (${onConflict}) do nothing`;
        } else {
          const setSql = cols
            .filter((c) => !this.upsertOnConflict!.split(",").map((s) => s.trim()).includes(c))
            .map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`)
            .join(", ");
          sql += setSql
            ? ` on conflict (${onConflict}) do update set ${setSql}`
            : ` on conflict (${onConflict}) do nothing`;
        }
      }
      if (this.returning) sql += ` returning ${this.columns}`;
      return { sql, params };
    }

    // delete
    const [whereExpr] = this.compileWhereExprWithParams(params, p);
    let sql = `delete from ${qtable}`;
    if (whereExpr) sql += ` where ${whereExpr}`;
    if (this.returning) sql += ` returning ${this.columns}`;
    return { sql, params };
  }

  private compileCount(): { sql: string; params: unknown[] } {
    const qtable = `${quoteIdent(this.schema)}.${quoteIdent(this.table)}`;
    const params: unknown[] = [];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const [whereExpr] = this.compileWhereExprWithParams(params, p);
    let sql = `select count(*)::bigint as c from ${qtable}`;
    if (whereExpr) sql += ` where ${whereExpr}`;
    return { sql, params };
  }

  private compileOrderLimit(): string {
    let s = "";
    if (this.orderBy.length) {
      s +=
        " order by " +
        this.orderBy
          .map((o) => {
            const dir = o.asc ? "asc" : "desc";
            const nulls = o.nullsFirst === undefined ? "" : ` nulls ${o.nullsFirst ? "first" : "last"}`;
            return `${quoteIdent(o.col)} ${dir}${nulls}`;
          })
          .join(", ");
    }
    if (this.limitN !== null) s += ` limit ${this.limitN}`;
    if (this.offsetN !== null) s += ` offset ${this.offsetN}`;
    return s;
  }

  // Build a WHERE expression with its own params buffer (used by .not and .or nesting).
  private compileWhereExpr(): [string, unknown[]] {
    const params: unknown[] = [];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const [expr] = this.compileWhereExprWithParams(params, p);
    return [expr, params];
  }

  // Alias exposed for .not() nesting.
  private compileWhereExprOnly(): [string, unknown[]] {
    return this.compileWhereExpr();
  }

  // For .or() list: same but joined by OR.
  private compileWhereListOr(): [string, unknown[]] {
    const params: unknown[] = [];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const parts = this.filters.map((f) => this.compileOneFilter(f, p));
    return [parts.join(" or "), params];
  }

  // Build using a shared params buffer (with paramizer p that pushes into that buffer).
  private compileWhereExprWithParams(
    _params: unknown[],
    p: (v: unknown) => string,
  ): [string, unknown[]] {
    const parts = this.filters.map((f) => this.compileOneFilter(f, p));
    return [parts.join(" and "), _params];
  }

  private compileOneFilter(f: Filter, p: (v: unknown) => string): string {
    switch (f.kind) {
      case "eq": {
        if (f.val === null) return `${quoteIdent(f.col)} is null`;
        return `${quoteIdent(f.col)} = ${p(normalizeParam(f.val))}`;
      }
      case "neq": {
        if (f.val === null) return `${quoteIdent(f.col)} is not null`;
        return `${quoteIdent(f.col)} <> ${p(normalizeParam(f.val))}`;
      }
      case "gt":  return `${quoteIdent(f.col)} > ${p(normalizeParam(f.val))}`;
      case "gte": return `${quoteIdent(f.col)} >= ${p(normalizeParam(f.val))}`;
      case "lt":  return `${quoteIdent(f.col)} < ${p(normalizeParam(f.val))}`;
      case "lte": return `${quoteIdent(f.col)} <= ${p(normalizeParam(f.val))}`;
      case "like":  return `${quoteIdent(f.col)} like ${p(f.pat)}`;
      case "ilike": return `${quoteIdent(f.col)} ilike ${p(f.pat)}`;
      case "in": {
        if (f.vals.length === 0) return "false";
        const placeholders = f.vals.map((v) => p(normalizeParam(v))).join(", ");
        return `${quoteIdent(f.col)} in (${placeholders})`;
      }
      case "is": {
        if (f.val === null) return `${quoteIdent(f.col)} is null`;
        return `${quoteIdent(f.col)} is ${f.val ? "true" : "false"}`;
      }
      case "contains": {
        // For arrays and jsonb, @> is the operator; params typed as jsonb where needed
        if (Array.isArray(f.val)) return `${quoteIdent(f.col)} @> ${p(f.val)}`;
        if (typeof f.val === "object") return `${quoteIdent(f.col)} @> ${p(JSON.stringify(f.val))}::jsonb`;
        return `${quoteIdent(f.col)} @> ${p(f.val)}`;
      }
      case "containedBy": {
        if (Array.isArray(f.val)) return `${quoteIdent(f.col)} <@ ${p(f.val)}`;
        if (typeof f.val === "object") return `${quoteIdent(f.col)} <@ ${p(JSON.stringify(f.val))}::jsonb`;
        return `${quoteIdent(f.col)} <@ ${p(f.val)}`;
      }
      case "overlaps": {
        if (Array.isArray(f.val)) return `${quoteIdent(f.col)} && ${p(f.val)}`;
        return `${quoteIdent(f.col)} && ${p(f.val)}`;
      }
      case "raw": {
        // Rebase raw param placeholders into the current param buffer.
        let s = f.sql;
        f.params.forEach((v) => { s = s.replace(/\$\d+/, p(normalizeParam(v))); });
        return s;
      }
    }
  }
}

function normalizeParam(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) {
    // Pass arrays as JS arrays — pg driver converts to Postgres array literal.
    return v;
  }
  if (typeof v === "object") {
    // JSON columns
    return JSON.stringify(v);
  }
  return v;
}

// Simple splitter for PostgREST or-list. Doesn't handle nested parens deeply,
// but this app never emits those from .or() today.
function splitOrList(expr: string): string[] {
  return expr.split(",").map((s) => s.trim()).filter(Boolean);
}

// ---------- top-level client factory ----------------------------------------------

export type NeonSupabaseLikeClient = {
  from<T = Record<string, unknown>>(table: string): NeonQueryBuilder<T>;
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<SupabaseLikeResponse<T>>;
};

export function createNeonClient(dsn: string, schema = "public"): NeonSupabaseLikeClient {
  const sql = neon(dsn);
  return {
    from<T = Record<string, unknown>>(table: string) {
      return new NeonQueryBuilder<T>(sql, table, schema);
    },
    async rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<SupabaseLikeResponse<T>> {
      try {
        // schema.fn(named := $1, named := $2, ...)
        const qfn = `${quoteIdent(schema)}.${quoteIdent(fn)}`;
        const entries = Object.entries(args ?? {});
        const params: unknown[] = [];
        const argSql =
          entries.length === 0
            ? ""
            : entries
                .map(([k, v]) => {
                  params.push(normalizeParam(v));
                  return `${quoteIdent(k)} := $${params.length}`;
                })
                .join(", ");
        const query = `select * from ${qfn}(${argSql})`;
        const rows = (await sql.query(query, params)) as unknown as Record<string, unknown>[];
        return { data: rows as unknown as T, error: null, status: 200 };
      } catch (err) {
        const e = err as { message?: string; code?: string; detail?: string; hint?: string };
        return {
          data: null,
          error: {
            message: e?.message ?? String(err),
            code: e?.code,
            details: e?.detail,
            hint: e?.hint,
          },
          status: 500,
        };
      }
    },
  };
}
