// Run the same probes as /api/admin/db-diag but locally, hitting Neon canonical directly.
// This lets us verify schema parity without needing to bypass Vercel SSO.
//
// Usage: DATABASE_URL_CANONICAL=... node scripts/db-diag-local.mjs

import { neon } from "@neondatabase/serverless";
const dsn = process.env.DATABASE_URL_CANONICAL;
if (!dsn) { console.error("Set DATABASE_URL_CANONICAL"); process.exit(1); }
const sql = neon(dsn);

const singleCount = async (t) => {
  try {
    const rows = await sql.query(`select count(*)::bigint as c from "public"."${t}"`);
    return { ok: true, count: Number(rows[0].c) };
  } catch (e) {
    return { ok: false, error: e.message.split("\n")[0] };
  }
};
const selectSample = async (t, cols) => {
  try {
    const rows = await sql.query(`select ${cols} from "public"."${t}" limit 3`);
    return { ok: true, sample: rows };
  } catch (e) {
    return { ok: false, error: e.message.split("\n")[0] };
  }
};

const results = {};
const probes = [
  ["tag.count", () => singleCount("tag")],
  ["tags.count", () => singleCount("tags")],
  ["company.count", () => singleCount("company")],
  ["companies.count", () => singleCount("companies")],
  ["contact.count", () => singleCount("contact")],
  ["contacts.count", () => singleCount("contacts")],
  ["social_mention.count", () => singleCount("social_mention")],
  ["social_mentions.count", () => singleCount("social_mentions")],
  ["linkedin_post.count", () => singleCount("linkedin_post")],
  ["linkedin_posts.count", () => singleCount("linkedin_posts")],
  ["list.select", () => selectSample("list", "id, name, kind")],
  ["lists.select", () => selectSample("lists", "id, name")],
  ["tag.select", () => selectSample("tag", "slug, label")],
];
for (const [n, f] of probes) results[n] = await f();
console.log(JSON.stringify(results, null, 2));
