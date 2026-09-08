/**
 * Seed linkedin_topic_tags from the exported IDN News Dashboard tag list.
 *
 * Reads /home/user/workspace/data/canonical_tags_full.json (951 tags).
 * Upserts into linkedin_topic_tags with derived keyword_phrases so the
 * pre-filter can cheaply reject irrelevant posts.
 *
 * Run: pnpm tsx scripts/seed-topic-tags.ts
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type TagRow = {
  tag_name: string;
  slug: string;
  category: string | null;
  description: string | null;
  total_articles_30d: number;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TAGS_JSON = process.env.TAGS_JSON ?? "/home/user/workspace/data/canonical_tags_full.json";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/**
 * Derive keyword phrases for a tag from its name + slug.
 * These are what the pre-filter looks for in post text.
 */
function derivePhrases(name: string, slug: string): string[] {
  const phrases = new Set<string>();
  // canonical name
  phrases.add(name.toLowerCase().trim());
  // slug with dashes replaced
  phrases.add(slug.replace(/-/g, " ").toLowerCase().trim());
  // slug as-is (some posts use hyphenated form)
  if (slug.includes("-")) phrases.add(slug.toLowerCase());
  // no-space compact form (e.g. "aiagents") — skip, too many false matches
  return [...phrases].filter((p) => p.length >= 3);
}

async function main() {
  const raw = readFileSync(TAGS_JSON, "utf8");
  const tags = JSON.parse(raw) as TagRow[];
  console.log(`Loaded ${tags.length} tags from ${TAGS_JSON}`);

  const rows = tags.map((t) => ({
    slug: t.slug,
    name: t.tag_name,
    category: t.category ?? null,
    description: t.description ?? null,
    keyword_phrases: derivePhrases(t.tag_name, t.slug),
    articles_30d: t.total_articles_30d ?? 0,
    active: true,
    weight: 1.0,
    aliases: [],
  }));

  // Batch upsert 200 at a time to stay under any statement limits.
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error, count } = await supa
      .from("linkedin_topic_tags")
      .upsert(batch, { onConflict: "slug", count: "exact" });
    if (error) {
      console.error(`Batch ${i}-${i + batch.length} failed:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`  upserted ${inserted}/${rows.length}\r`);
  }
  console.log(`\nDone. Upserted ${inserted} tags.`);

  // Sanity check
  const { count: total } = await supa
    .from("linkedin_topic_tags")
    .select("*", { count: "exact", head: true });
  const { count: withPhrases } = await supa
    .from("linkedin_topic_tags")
    .select("*", { count: "exact", head: true })
    .not("keyword_phrases", "eq", "{}");
  console.log(`Table has ${total} rows total, ${withPhrases} with keyword phrases.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
