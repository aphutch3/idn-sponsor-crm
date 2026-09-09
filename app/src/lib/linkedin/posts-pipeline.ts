// Posts pipeline: fetch → dedup → score → upsert → emit signals.
//
// Called from runMonitor when a config includes `company_posts` or
// `profile_activity` in fetch_types. Handles a single entity (company
// or contact) end-to-end and returns a per-entity summary the caller
// can aggregate.

import { dbWrite } from "@/lib/supabase";
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

/** Fetch, score, and persist posts for one entity. */
export async function runPostsForEntity(input: RunPostsInput): Promise<PostsEntitySummary> {
  const supa = dbWrite();

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
  const { data: existing, error: exErr } = await supa
    .from("linkedin_posts")
    .select("post_urn, relevance_score, scored_at")
    .in("post_urn", urns);
  if (exErr) {
    return {
      ok: false, fetched: raw.length, new_posts: 0, scored: 0, signals_emitted: 0,
      error: `existing lookup: ${exErr.message}`,
    };
  }
  const seen = new Map<string, { relevance_score: number | null; scored_at: string | null }>();
  for (const row of existing ?? []) {
    seen.set((row as { post_urn: string }).post_urn, {
      relevance_score: (row as { relevance_score: number | null }).relevance_score,
      scored_at: (row as { scored_at: string | null }).scored_at,
    });
  }

  const newPosts = raw.filter((p) => !seen.has(p.urn));

  // 3. Score new posts (parallel, capped)
  const shouldScore = input.score_posts !== false;
  const tags = shouldScore ? await loadTopicTags() : [];
  const SCORE_CONCURRENCY = 3;
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

  // 4. Upsert linkedin_posts (new + refresh last_fetched_at on existing)
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
      raw: p.raw as unknown as object,
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

  const { error: upErr } = await supa
    .from("linkedin_posts")
    .upsert(rows, { onConflict: "post_urn" });
  if (upErr) {
    return {
      ok: false, fetched: raw.length, new_posts: newPosts.length, scored: scored.length, signals_emitted: 0,
      error: `upsert posts: ${upErr.message}`,
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
    const sigRows = worthy.map((s) => ({
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      signal_kind: "new_post" as const,
      snapshot_id: null,
      meta: {
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
      },
    }));
    const { error: sigErr, count } = await supa
      .from("linkedin_signals")
      .insert(sigRows, { count: "exact" });
    if (sigErr) {
      return {
        ok: false, fetched: raw.length, new_posts: newPosts.length, scored: scored.length, signals_emitted: 0,
        error: `emit signals: ${sigErr.message}`,
      };
    }
    signals_emitted = count ?? worthy.length;
  }

  return {
    ok: true,
    fetched: raw.length,
    new_posts: newPosts.length,
    scored: scored.length,
    signals_emitted,
  };
}
