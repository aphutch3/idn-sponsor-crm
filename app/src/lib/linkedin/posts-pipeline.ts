// Posts pipeline: fetch → dedup → score → upsert → emit signals.
//
// Called from runMonitor when a config includes `company_posts` or
// `profile_activity` in fetch_types. Handles a single entity (company
// or contact) end-to-end and returns a per-entity summary the caller
// can aggregate.
//
// Canonical singular tables: linkedin_post, linkedin_signal.

import { sql } from "@/lib/db";
import { fetchCompanyPosts, fetchProfilePosts, type RawPost } from "@/lib/apify/linkedin-posts";
import { loadTopicTags } from "./tags";
import { scorePostRelevance } from "./relevance";

export type PostsEntitySummary = {
  readonly ok: boolean;
  readonly fetched: number;
  readonly new_posts: number;
  readonly scored: number;
  readonly signals_emitted: number;
  readonly error?: string;
  readonly rate_limited?: boolean;
  readonly blocked?: boolean;
};

export type RunPostsInput = {
  readonly entity_type: "company" | "contact";
  readonly entity_id: string;
  readonly linkedin_url: string;
  readonly author_context?: string;
  readonly monitor_config_id: string;
  readonly relevance_min_score: number;   // 0-100
  readonly topic_filter?: readonly string[]; // optional slug allowlist
  readonly score_posts?: boolean;         // default true
  readonly limit?: number;
};

type ExistingPostRow = {
  post_urn: string;
  relevance_score: number | null;
  scored_at: string | null;
};

/** Fetch, score, and persist posts for one entity. */
export async function runPostsForEntity(input: RunPostsInput): Promise<PostsEntitySummary> {
  // 1. Fetch
  const fetched = input.entity_type === "company"
    ? await fetchCompanyPosts(input.linkedin_url, { limit: input.limit })
    : await fetchProfilePosts(input.linkedin_url, { limit: input.limit });

  if (!fetched.ok) {
    return {
      ok: false,
      fetched: 0,
      new_posts: 0,
      scored: 0,
      signals_emitted: 0,
      error: fetched.error,
      rate_limited: fetched.rate_limited,
      blocked: fetched.blocked,
    };
  }

  const raw = fetched.posts;
  if (raw.length === 0) {
    return { ok: true, fetched: 0, new_posts: 0, scored: 0, signals_emitted: 0 };
  }

  // 2. Dedup vs existing rows for this entity (only score truly new posts)
  const urns = raw.map((p) => p.urn);
  let existing: ExistingPostRow[] = [];
  try {
    existing = await sql<ExistingPostRow[]>`
      select post_urn, relevance_score, scored_at
        from public.linkedin_post
       where post_urn in ${sql(urns)}
    `;
  } catch (e) {
    return {
      ok: false, fetched: raw.length, new_posts: 0, scored: 0, signals_emitted: 0,
      error: `existing lookup: ${(e as Error).message}`,
    };
  }
  const seen = new Map<string, { relevance_score: number | null; scored_at: string | null }>();
  for (const row of existing) {
    seen.set(row.post_urn, { relevance_score: row.relevance_score, scored_at: row.scored_at });
  }

  const newPosts = raw.filter((p) => !seen.has(p.urn));

  // 3. Score new posts (parallel, capped)
  const shouldScore = input.score_posts !== false;
  const tags = shouldScore ? await loadTopicTags() : [];
  const SCORE_CONCURRENCY = 2;
  const scored: Array<{ post: RawPost; score: number; topics: string[]; reason: string; hits: string[]; model: string }> = [];

  if (shouldScore && newPosts.length > 0) {
    for (let i = 0; i < newPosts.length; i += SCORE_CONCURRENCY) {
      const chunk = newPosts.slice(i, i + SCORE_CONCURRENCY);
      const results = await Promise.all(
        chunk.map((p) => scorePostRelevance(
          { text: p.text ?? "", url: p.url, author_context: input.author_context },
          { tags },
        )),
      );
      for (let k = 0; k < chunk.length; k++) {
        const p = chunk[k];
        const r = results[k];
        if (!p || !r) continue;
        scored.push({
          post: p,
          score: r.score,
          topics: [...r.topics],
          reason: r.reason,
          hits: [...r.keyword_hits],
          model: r.scorer_model,
        });
      }
    }
  }

  // 4. Upsert linkedin_post (new + refresh last_fetched_at on existing).
  //    Canonical uses ARRAY columns for keyword_hits + relevance_topics; postgres.js
  //    encodes JS arrays via sql.array. jsonb `raw` goes through sql.json.
  const nowIso = new Date().toISOString();
  const rows = raw.map((p) => {
    const s = scored.find((x) => x.post.urn === p.urn);
    return {
      post_urn: p.urn,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      posted_at: p.posted_at_iso ?? null,
      post_text: p.text ?? null,
      post_url: p.url ?? null,
      media_kind: p.media_kind ?? null,
      reactions: p.reactions ?? null,
      comments: p.comments ?? null,
      reposts: p.reposts ?? null,
      raw: p.raw as unknown,
      keyword_hits: s?.hits ?? [],
      relevance_score: s?.score ?? null,
      relevance_topics: s?.topics ?? [],
      relevance_reason: s?.reason ?? null,
      scored_at: s ? nowIso : null,
      scorer_model: s?.model ?? null,
      monitor_config_id: input.monitor_config_id,
      last_fetched_at: nowIso,
    };
  });

  // Row-by-row upsert keeps types simple and stable against postgres.js's
  // helper-encoding of jsonb + text[] mixed rows. Batch sizes here are small
  // (bounded by Apify's per-fetch limit).
  try {
    for (const r of rows) {
      await sql`
        insert into public.linkedin_post
          (post_urn, entity_type, entity_id, posted_at, post_text, post_url,
           media_kind, reactions, comments, reposts, raw,
           keyword_hits, relevance_score, relevance_topics, relevance_reason,
           scored_at, scorer_model, monitor_config_id, last_fetched_at)
        values
          (${r.post_urn},
           ${r.entity_type},
           ${r.entity_id},
           ${r.posted_at},
           ${r.post_text},
           ${r.post_url},
           ${r.media_kind},
           ${r.reactions},
           ${r.comments},
           ${r.reposts},
           ${sql.json((r.raw ?? {}) as unknown as Parameters<typeof sql.json>[0])},
           ${sql.array(r.keyword_hits)}::text[],
           ${r.relevance_score},
           ${sql.array(r.relevance_topics)}::text[],
           ${r.relevance_reason},
           ${r.scored_at},
           ${r.scorer_model},
           ${r.monitor_config_id},
           ${r.last_fetched_at})
        on conflict (post_urn) do update set
          entity_type       = excluded.entity_type,
          entity_id         = excluded.entity_id,
          posted_at         = coalesce(excluded.posted_at, linkedin_post.posted_at),
          post_text         = coalesce(excluded.post_text, linkedin_post.post_text),
          post_url          = coalesce(excluded.post_url, linkedin_post.post_url),
          media_kind        = coalesce(excluded.media_kind, linkedin_post.media_kind),
          reactions         = coalesce(excluded.reactions, linkedin_post.reactions),
          comments          = coalesce(excluded.comments, linkedin_post.comments),
          reposts           = coalesce(excluded.reposts, linkedin_post.reposts),
          raw               = excluded.raw,
          keyword_hits      = case when excluded.scored_at is not null
                                   then excluded.keyword_hits
                                   else linkedin_post.keyword_hits end,
          relevance_score   = case when excluded.scored_at is not null
                                   then excluded.relevance_score
                                   else linkedin_post.relevance_score end,
          relevance_topics  = case when excluded.scored_at is not null
                                   then excluded.relevance_topics
                                   else linkedin_post.relevance_topics end,
          relevance_reason  = case when excluded.scored_at is not null
                                   then excluded.relevance_reason
                                   else linkedin_post.relevance_reason end,
          scored_at         = case when excluded.scored_at is not null
                                   then excluded.scored_at
                                   else linkedin_post.scored_at end,
          scorer_model      = case when excluded.scored_at is not null
                                   then excluded.scorer_model
                                   else linkedin_post.scorer_model end,
          monitor_config_id = excluded.monitor_config_id,
          last_fetched_at   = excluded.last_fetched_at
      `;
    }
  } catch (e) {
    return {
      ok: false, fetched: raw.length, new_posts: newPosts.length, scored: scored.length, signals_emitted: 0,
      error: `upsert posts: ${(e as Error).message}`,
    };
  }

  // 5. Emit new_post signals for scored posts above threshold + topic filter
  const threshold = input.relevance_min_score;
  const filter = new Set(input.topic_filter ?? []);
  const worthy = scored.filter((s) => {
    if (s.score < threshold) return false;
    if (filter.size === 0) return true;
    return s.topics.some((t) => filter.has(t));
  });

  let signals_emitted = 0;
  if (worthy.length > 0) {
    try {
      for (const s of worthy) {
        const meta = {
          monitor_config_id: input.monitor_config_id,
          post_urn: s.post.urn,
          post_url: s.post.url,
          posted_at: s.post.posted_at_iso,
          snippet: (s.post.text ?? "").slice(0, 500),
          score: s.score,
          topics: s.topics,
          reason: s.reason,
          reactions: s.post.reactions,
          comments: s.post.comments,
          reposts: s.post.reposts,
          scorer_model: s.model,
        };
        await sql`
          insert into public.linkedin_signal
            (entity_type, entity_id, signal_kind, snapshot_id, meta)
          values
            (${input.entity_type},
             ${input.entity_id},
             ${"new_post"},
             ${null},
             ${sql.json(meta as unknown as Parameters<typeof sql.json>[0])})
        `;
      }
      signals_emitted = worthy.length;
    } catch (e) {
      return {
        ok: false, fetched: raw.length, new_posts: newPosts.length, scored: scored.length, signals_emitted: 0,
        error: `emit signals: ${(e as Error).message}`,
      };
    }
  }

  return {
    ok: true,
    fetched: raw.length,
    new_posts: newPosts.length,
    scored: scored.length,
    signals_emitted,
  };
}
