// Pure filter compiler: FilterExpr → parameterized SQL fragment.
// CORE MODULE — no I/O, no side effects. Ports 1:1 to Rust.
//
// Rust signature target:
//   fn compile_filter(expr: &FilterExpr, target: &FilterTarget)
//     -> Result<CompiledFilter, ListError>
//
// SQL injection defense:
//   - field names come only from target.allowed_fields (never interpolated raw)
//   - values are always $N parameters, never string-inlined
//   - operators are validated per field kind

import type {
  FieldSpec,
  FilterCond,
  FilterExpr,
  FilterOp,
  FilterTarget,
  FilterValue,
} from "./types";
import { err, ok, type Result, type ListError } from "./errors";

export type CompiledFilter = {
  readonly where_sql: string; // e.g. "(a.sponsor_tier_rank <= $1 AND a.stay_on_top = $2)"
  readonly params: readonly unknown[];
};

type Ctx = {
  readonly target: FilterTarget;
  readonly alias: string;
  params: unknown[]; // mutated locally; not exposed
};

// Map field kind -> the SQL cast to append to $N so the DB compares against the
// right type. Values always travel to the RPC as text (jsonb-serialized);
// the cast happens at bind time inside the WHERE.
function castFor(kind: FieldSpec["kind"]): string {
  switch (kind) {
    case "text":       return "::text";
    case "int":        return "::bigint";
    case "numeric":    return "::numeric";
    case "bool":       return "::boolean";
    case "timestamp":  return "::timestamptz";
    case "text_array": return "::text"; // scalars only reach here via 'contains'
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

function arrayCastFor(kind: FieldSpec["kind"]): string {
  switch (kind) {
    case "text":       return "::text[]";
    case "int":        return "::bigint[]";
    case "numeric":    return "::numeric[]";
    case "bool":       return "::boolean[]";
    case "timestamp":  return "::timestamptz[]";
    case "text_array": return "::text[]";
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

export function compileFilter(
  expr: FilterExpr,
  target: FilterTarget,
  alias: string = "t",
): Result<CompiledFilter, ListError> {
  const ctx: Ctx = { target, alias, params: [] };
  const r = compileExpr(expr, ctx);
  if (!r.ok) return r;
  return ok({ where_sql: r.value, params: ctx.params });
}

function compileExpr(expr: FilterExpr, ctx: Ctx): Result<string, ListError> {
  switch (expr.kind) {
    case "cond":
      return compileCond(expr, ctx);
    case "and": {
      if (expr.clauses.length === 0) return err({ kind: "empty_group", group: "and" });
      const parts: string[] = [];
      for (const c of expr.clauses) {
        const r = compileExpr(c, ctx);
        if (!r.ok) return r;
        parts.push(r.value);
      }
      return ok(`(${parts.join(" AND ")})`);
    }
    case "or": {
      if (expr.clauses.length === 0) return err({ kind: "empty_group", group: "or" });
      const parts: string[] = [];
      for (const c of expr.clauses) {
        const r = compileExpr(c, ctx);
        if (!r.ok) return r;
        parts.push(r.value);
      }
      return ok(`(${parts.join(" OR ")})`);
    }
    case "not": {
      const r = compileExpr(expr.clause, ctx);
      if (!r.ok) return r;
      return ok(`NOT (${r.value})`);
    }
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

function compileCond(c: FilterCond, ctx: Ctx): Result<string, ListError> {
  const spec = ctx.target.allowed_fields[c.field];
  if (!spec) {
    return err({
      kind: "unknown_field",
      field: c.field,
      entity_type: ctx.target.entity_type,
    });
  }
  const col = `${ctx.alias}.${spec.column}`;

  // Validate op is legal for this field kind
  if (!isOpAllowed(c.op, spec)) {
    return err({ kind: "unsupported_op", op: c.op, field: c.field });
  }

  switch (c.op) {
    case "is_null":
      return ok(`${col} IS NULL`);
    case "is_not_null":
      return ok(`${col} IS NOT NULL`);
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const vr = coerceScalar(c.value, spec, c.field);
      if (!vr.ok) return vr;
      const p = pushParam(ctx, serializeParam(vr.value));
      const sqlOp = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[c.op];
      return ok(`${col} ${sqlOp} ${p}${castFor(spec.kind)}`);
    }
    case "like": {
      const vr = coerceScalar(c.value, spec, c.field);
      if (!vr.ok) return vr;
      if (typeof vr.value !== "string") {
        return err({
          kind: "type_mismatch",
          field: c.field,
          expected: "string",
          got: typeof vr.value,
        });
      }
      const p = pushParam(ctx, `%${vr.value}%`);
      return ok(`${col} ILIKE ${p}::text`);
    }
    case "in":
    case "nin": {
      const vr = coerceArray(c.value, spec, c.field);
      if (!vr.ok) return vr;
      if (vr.value.length === 0) {
        return ok(c.op === "in" ? "false" : "true");
      }
      // Serialize the array as a Postgres literal: '{a,b,c}' — the RPC receives
      // it as one text param and we cast to <field>[] in-SQL.
      const p = pushParam(ctx, pgArrayLiteral(vr.value));
      return ok(`${col} ${c.op === "in" ? "= ANY" : "<> ALL"}(${p}${arrayCastFor(spec.kind)})`);
    }
    case "contains": {
      if (spec.kind !== "text_array") {
        return err({ kind: "unsupported_op", op: c.op, field: c.field });
      }
      const vr = coerceScalar(c.value, { column: spec.column, kind: "text" }, c.field);
      if (!vr.ok) return vr;
      const p = pushParam(ctx, serializeParam(vr.value));
      return ok(`${p}::text = ANY(${col})`);
    }
    default: {
      const _exhaustive: never = c.op;
      return _exhaustive;
    }
  }
}

function pushParam(ctx: Ctx, v: unknown): string {
  ctx.params.push(v);
  return `$${ctx.params.length}`;
}

// Every param travels to the RPC as a string; casts in the SQL restore the type.
function serializeParam(v: string | number | boolean): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

// Build a Postgres array literal like '{a,"b c",d}' from a homogeneous JS array.
function pgArrayLiteral(arr: readonly (string | number | boolean)[]): string {
  const parts = arr.map((v) => {
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    // Quote text; escape backslashes and quotes per PG array syntax.
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  });
  return `{${parts.join(",")}}`;
}

function isOpAllowed(op: FilterOp, spec: FieldSpec): boolean {
  switch (spec.kind) {
    case "text":
      return (
        op === "eq" ||
        op === "neq" ||
        op === "in" ||
        op === "nin" ||
        op === "like" ||
        op === "is_null" ||
        op === "is_not_null"
      );
    case "int":
    case "numeric":
    case "timestamp":
      return (
        op === "eq" ||
        op === "neq" ||
        op === "in" ||
        op === "nin" ||
        op === "gt" ||
        op === "gte" ||
        op === "lt" ||
        op === "lte" ||
        op === "is_null" ||
        op === "is_not_null"
      );
    case "bool":
      return op === "eq" || op === "neq" || op === "is_null" || op === "is_not_null";
    case "text_array":
      return op === "contains" || op === "is_null" || op === "is_not_null";
    default: {
      const _exhaustive: never = spec.kind;
      return _exhaustive;
    }
  }
}

function coerceScalar(
  v: FilterValue | undefined,
  spec: FieldSpec,
  field: string,
): Result<string | number | boolean, ListError> {
  if (v === undefined || v === null) {
    return err({
      kind: "validation",
      issues: [`field '${field}' requires a value for this operator`],
    });
  }
  if (Array.isArray(v)) {
    return err({
      kind: "type_mismatch",
      field,
      expected: spec.kind,
      got: "array",
    });
  }
  switch (spec.kind) {
    case "text":
      if (typeof v !== "string") {
        return err({ kind: "type_mismatch", field, expected: "string", got: typeof v });
      }
      return ok(v);
    case "int":
      if (typeof v !== "number" || !Number.isInteger(v)) {
        return err({ kind: "type_mismatch", field, expected: "integer", got: typeof v });
      }
      return ok(v);
    case "numeric":
      if (typeof v !== "number") {
        return err({ kind: "type_mismatch", field, expected: "number", got: typeof v });
      }
      return ok(v);
    case "bool":
      if (typeof v !== "boolean") {
        return err({ kind: "type_mismatch", field, expected: "boolean", got: typeof v });
      }
      return ok(v);
    case "timestamp":
      if (typeof v !== "string") {
        return err({
          kind: "type_mismatch",
          field,
          expected: "ISO timestamp string",
          got: typeof v,
        });
      }
      // Trust the DB to parse ISO strings; reject empty
      if (v.length === 0) {
        return err({ kind: "validation", issues: [`empty timestamp on '${field}'`] });
      }
      return ok(v);
    case "text_array":
      // scalar coercion on a text_array field is used only by 'contains' pre-check
      if (typeof v !== "string") {
        return err({ kind: "type_mismatch", field, expected: "string", got: typeof v });
      }
      return ok(v);
    default: {
      const _exhaustive: never = spec.kind;
      return _exhaustive;
    }
  }
}

function coerceArray(
  v: FilterValue | undefined,
  spec: FieldSpec,
  field: string,
): Result<readonly (string | number | boolean)[], ListError> {
  if (!Array.isArray(v)) {
    return err({
      kind: "type_mismatch",
      field,
      expected: `${spec.kind}[]`,
      got: v === undefined ? "undefined" : typeof v,
    });
  }
  // Uniformity check
  for (const item of v) {
    switch (spec.kind) {
      case "text":
        if (typeof item !== "string") {
          return err({
            kind: "type_mismatch",
            field,
            expected: "string[]",
            got: `${typeof item}[]`,
          });
        }
        break;
      case "int":
        if (typeof item !== "number" || !Number.isInteger(item)) {
          return err({
            kind: "type_mismatch",
            field,
            expected: "integer[]",
            got: `${typeof item}[]`,
          });
        }
        break;
      case "numeric":
        if (typeof item !== "number") {
          return err({
            kind: "type_mismatch",
            field,
            expected: "number[]",
            got: `${typeof item}[]`,
          });
        }
        break;
      case "bool":
        if (typeof item !== "boolean") {
          return err({
            kind: "type_mismatch",
            field,
            expected: "boolean[]",
            got: `${typeof item}[]`,
          });
        }
        break;
      case "timestamp":
        if (typeof item !== "string") {
          return err({
            kind: "type_mismatch",
            field,
            expected: "timestamp[]",
            got: `${typeof item}[]`,
          });
        }
        break;
      case "text_array":
        return err({ kind: "unsupported_op", op: "in", field });
      default: {
        const _exhaustive: never = spec.kind;
        return _exhaustive;
      }
    }
  }
  return ok(v);
}
