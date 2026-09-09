// Parity smoke test for the Neon shim: run a variety of PostgREST-style chains against canonical
// and print row counts / sample rows / errors. Not a real test framework — just a fast sanity pass.
//
// Usage:
//   DATABASE_URL_CANONICAL=postgresql://... node scripts/test-neon-shim.mjs
//
// This script imports the compiled shim from .next isn't required — Next's tsconfig maps @/ to src/.
// We use tsx via `npx tsx` in the shell wrapper, or invoke the compiled JS after `next build`.
// Here we intentionally re-implement a tiny runner using the SAME driver, so we don't depend on tsx.

import { neon } from "@neondatabase/serverless";

const dsn = process.env.DATABASE_URL_CANONICAL;
if (!dsn) {
  console.error("Set DATABASE_URL_CANONICAL first.");
  process.exit(1);
}

const sql = neon(dsn);

// A tiny inline copy of the compileOneFilter surface we care about, to validate the DB actually
// accepts the SQL patterns the shim will generate.
const cases = [
  {
    name: "select count via bigint",
    text: `select count(*)::bigint as c from "public"."company"`,
    params: [],
    check: (rows) => Number(rows[0].c) === 2087,
  },
  {
    name: "eq + limit",
    text: `select id, name from "public"."company" where "domain" = $1 limit 1`,
    params: ["salesforce.com"],
    check: (rows) => rows.length === 1 && rows[0].name === "Salesforce",
  },
  {
    name: "ilike",
    text: `select count(*)::bigint as c from "public"."contact" where "email" ilike $1`,
    params: ["%@ibm.com"],
    check: (rows) => Number(rows[0].c) > 0,
  },
  {
    name: "in (multi-value)",
    text: `select count(*)::bigint as c from "public"."tag" where "slug" in ($1,$2,$3)`,
    params: ["marketing-contact", "non-marketing-contact", "startup"],
    check: (rows) => Number(rows[0].c) === 3,
  },
  {
    name: "order by asc",
    text: `select "slug" from "public"."tag" order by "slug" asc limit 3`,
    params: [],
    check: (rows) => rows.length === 3 && rows[0].slug < rows[1].slug,
  },
  {
    name: "array contains (@>) on entity_types",
    text: `select count(*)::bigint as c from "public"."list" where "entity_types" @> $1`,
    params: [["company"]],
    check: (rows) => Number(rows[0].c) >= 0, // just checking SQL parses
  },
  {
    name: "array overlaps (&&)",
    text: `select count(*)::bigint as c from "public"."linkedin_topic_tag" where "aliases" && $1`,
    params: [["ai", "llm"]],
    check: (rows) => Number(rows[0].c) >= 0,
  },
  {
    name: "is null",
    text: `select count(*)::bigint as c from "public"."company" where "domain" is null`,
    params: [],
    check: (rows) => Number(rows[0].c) === 0,
  },
  {
    name: "insert + returning",
    text: `
      insert into "public"."tag" ("slug", "label") values ($1, $2)
      on conflict ("slug") do update set "label" = excluded."label"
      returning "slug", "label"
    `,
    params: ["_shim_test", "shim self-test"],
    check: (rows) => rows.length === 1 && rows[0].slug === "_shim_test",
  },
  {
    name: "update + returning",
    text: `
      update "public"."tag" set "label" = $1 where "slug" = $2 returning "slug", "label"
    `,
    params: ["shim self-test v2", "_shim_test"],
    check: (rows) => rows.length === 1 && rows[0].label === "shim self-test v2",
  },
  {
    name: "delete + returning",
    text: `delete from "public"."tag" where "slug" = $1 returning "slug"`,
    params: ["_shim_test"],
    check: (rows) => rows.length === 1 && rows[0].slug === "_shim_test",
  },
  {
    name: "select with alias:col",
    text: `select "name" as "org_name" from "public"."company" where "domain" = $1`,
    params: ["ibm.com"],
    check: (rows) => rows.length === 1 && rows[0].org_name === "IBM",
  },
];

let failed = 0;
for (const c of cases) {
  try {
    const rows = await sql.query(c.text, c.params);
    const ok = c.check(rows);
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  (rows=${rows.length})`);
    if (!ok) failed++;
  } catch (err) {
    console.log(`ERROR ${c.name}: ${err.message}`);
    failed++;
  }
}

console.log(`\n${failed === 0 ? "OK all cases pass" : failed + " failure(s)"}`);
process.exit(failed === 0 ? 0 : 1);
