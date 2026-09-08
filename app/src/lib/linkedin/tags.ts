// IDN topic-tag taxonomy: load + keyword pre-filter.
//
// The taxonomy lives in linkedin_topic_tags (951 rows). Each tag has
// derived keyword_phrases that we match against post text with word
// boundaries. Cheap pre-filter that reduces LLM traffic to relevant posts.

import { dbWrite } from "@/lib/supabase";

export type TopicTag = {
  readonly slug: string;
  readonly name: string;
  readonly category: string | null;
  readonly description: string | null;
  readonly keyword_phrases: readonly string[];
  readonly articles_30d: number;
};

let _cache: { rows: readonly TopicTag[]; loaded_at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Load all active tags. Cached for 5 minutes across warm invocations. */
export async function loadTopicTags(opts?: { force?: boolean }): Promise<readonly TopicTag[]> {
  const now = Date.now();
  if (!opts?.force && _cache && now - _cache.loaded_at < CACHE_TTL_MS) {
    return _cache.rows;
  }
  const { data, error } = await dbWrite()
    .from("linkedin_topic_tags")
    .select("slug, name, category, description, keyword_phrases, articles_30d")
    .eq("active", true);
  if (error) throw new Error(`load_topic_tags: ${error.message}`);
  const rows = (data ?? []) as TopicTag[];
  _cache = { rows, loaded_at: now };
  return rows;
}

// ------------------------------------------------------------------
// Keyword pre-filter
// ------------------------------------------------------------------

/**
 * Match post text against keyword phrases. Returns the tag slugs whose
 * phrases appear as whole tokens in the text.
 *
 * Whole-token matching uses lowercase word boundaries to avoid
 * `ai` matching `mainly`, `ml` matching `html`, etc. Multi-word phrases
 * are matched as substrings between whitespace/punct.
 */
export function matchKeywords(text: string, tags: readonly TopicTag[]): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  // Normalize punctuation to spaces so word boundaries hit cleanly.
  const norm = " " + lower.replace(/[^\p{L}\p{N}\s#@\-.]/gu, " ").replace(/\s+/g, " ") + " ";

  const hits: string[] = [];
  for (const tag of tags) {
    for (const phrase of tag.keyword_phrases) {
      if (phrase.length < 3) continue;
      // Multi-word: substring check between whitespace boundaries
      if (phrase.includes(" ")) {
        if (norm.includes(` ${phrase} `)) { hits.push(tag.slug); break; }
      } else {
        // Single token: require word boundaries.
        // Support hyphenated single-tokens like "ai-agents" by treating
        // hyphens as part of the token.
        if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(phrase)}([^\\p{L}\\p{N}]|$)`, "u").test(norm)) {
          hits.push(tag.slug);
          break;
        }
      }
    }
  }
  return hits;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
