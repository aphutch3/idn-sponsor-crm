// Compiler tests. Pure function → deterministic inputs/outputs.
// Run with: cd app && npx tsx --test src/lib/lists/filter-compile.test.ts
// (Add tsx as dev dep once test runner is standardized in the repo.)

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compileFilter } from "./filter-compile";
import { COMPANY_TARGET, CONTACT_TARGET } from "./filter-fields";
import type { FilterExpr } from "./types";

test("simple eq on text", () => {
  const f: FilterExpr = {
    kind: "cond",
    field: "macro_category",
    op: "eq",
    value: "AI Infrastructure",
  };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.where_sql, "t.macro_category = $1::text");
    assert.deepEqual(r.value.params, ["AI Infrastructure"]);
  }
});

test("and of cond and bool cond", () => {
  const f: FilterExpr = {
    kind: "and",
    clauses: [
      { kind: "cond", field: "sponsor_tier_rank", op: "lte", value: 200 },
      { kind: "cond", field: "stay_on_top", op: "eq", value: true },
    ],
  };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.where_sql, "(t.sponsor_tier_rank <= $1::bigint AND t.stay_on_top = $2::boolean)");
    assert.deepEqual(r.value.params, ["200", "true"]);
  }
});

test("or nested inside and", () => {
  const f: FilterExpr = {
    kind: "and",
    clauses: [
      { kind: "cond", field: "sponsor_tier_rank", op: "lte", value: 100 },
      {
        kind: "or",
        clauses: [
          { kind: "cond", field: "is_customer", op: "eq", value: true },
          { kind: "cond", field: "stay_on_top", op: "eq", value: true },
        ],
      },
    ],
  };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(
      r.value.where_sql,
      "(t.sponsor_tier_rank <= $1::bigint AND (t.is_customer = $2::boolean OR t.stay_on_top = $3::boolean))",
    );
    assert.deepEqual(r.value.params, ["100", "true", "true"]);
  }
});

test("in with array of strings", () => {
  const f: FilterExpr = {
    kind: "cond",
    field: "macro_category",
    op: "in",
    value: ["AI Infrastructure", "DevTools", "Observability"],
  };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.where_sql, "t.macro_category = ANY($1::text[])");
    assert.equal(
      r.value.params[0],
      '{"AI Infrastructure","DevTools","Observability"}',
    );
  }
});

test("empty in => false constant", () => {
  const f: FilterExpr = { kind: "cond", field: "macro_category", op: "in", value: [] };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.where_sql, "false");
    assert.deepEqual(r.value.params, []);
  }
});

test("empty nin => true constant", () => {
  const f: FilterExpr = { kind: "cond", field: "macro_category", op: "nin", value: [] };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.where_sql, "true");
});

test("contains on text_array field", () => {
  const f: FilterExpr = {
    kind: "cond",
    field: "key_contact",
    op: "contains",
    value: "FRIEND",
  };
  const r = compileFilter(f, CONTACT_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.where_sql, "$1::text = ANY(t.key_contact)");
    assert.deepEqual(r.value.params, ["FRIEND"]);
  }
});

test("like wraps with % on both sides", () => {
  const f: FilterExpr = { kind: "cond", field: "name", op: "like", value: "cloud" };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.where_sql, "t.name ILIKE $1::text");
    assert.deepEqual(r.value.params, ["%cloud%"]);
  }
});

test("is_null and is_not_null need no params", () => {
  const f: FilterExpr = {
    kind: "and",
    clauses: [
      { kind: "cond", field: "domain", op: "is_null" },
      { kind: "cond", field: "linkedin_url", op: "is_not_null" },
    ],
  };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.where_sql, "(t.domain IS NULL AND t.linkedin_url IS NOT NULL)");
    assert.deepEqual(r.value.params, []);
  }
});

test("reserved word column is properly quoted", () => {
  const f: FilterExpr = { kind: "cond", field: "group", op: "eq", value: "AI Runtime" };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.where_sql, `t."group" = $1::text`);
});

test("not wraps a group", () => {
  const f: FilterExpr = {
    kind: "not",
    clause: { kind: "cond", field: "is_customer", op: "eq", value: true },
  };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.where_sql, "NOT (t.is_customer = $1::boolean)");
});

test("unknown field rejected", () => {
  const f: FilterExpr = { kind: "cond", field: "ssn", op: "eq", value: "x" };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "unknown_field");
});

test("unsupported op on field kind rejected", () => {
  const f: FilterExpr = { kind: "cond", field: "sponsor_tier_rank", op: "like", value: "x" };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "unsupported_op");
});

test("type mismatch rejected", () => {
  const f: FilterExpr = { kind: "cond", field: "sponsor_tier_rank", op: "eq", value: "one hundred" };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "type_mismatch");
});

test("empty and-group rejected", () => {
  const f = { kind: "and", clauses: [] } as unknown as FilterExpr;
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "empty_group");
});

test("SQL injection attempt via field name is neutralized", () => {
  // Attacker tries a suspicious field name; not in whitelist → rejected.
  const f = {
    kind: "cond",
    field: "name; DROP TABLE companies;--",
    op: "eq",
    value: "x",
  } as unknown as FilterExpr;
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "unknown_field");
});

test("SQL injection attempt via value is parameterized", () => {
  const evil = "'; DROP TABLE companies;--";
  const f: FilterExpr = { kind: "cond", field: "name", op: "eq", value: evil };
  const r = compileFilter(f, COMPANY_TARGET);
  assert.equal(r.ok, true);
  if (r.ok) {
    // Value goes into params array — never inlined into SQL
    assert.equal(r.value.where_sql, "t.name = $1::text");
    assert.equal(r.value.params[0], evil);
  }
});
