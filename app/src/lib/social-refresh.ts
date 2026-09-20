// Server-only. Runs the X-search pipeline that scripts/refresh_social_mentions.py runs
// on the 6h cron, but in TypeScript so it can be triggered from the Next.js API route
// (Refresh now button). Writes to canonical Neon (public.social_mention +
// public.social_refresh_log) via postgres.js — no Supabase.

import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";

const X_API_BASE = "https://api.x.com";

// Must match the 8 topics in scripts/refresh_social_mentions.py.
export const TOPIC_QUERIES: Array<{ topic: string; query: string }> = [
  { topic: "Copilot",              query: '("github copilot" OR "copilot workspace") lang:en -is:retweet' },
  { topic: "LLM tooling",          query: '("llm tooling" OR "prompt eval" OR "datasette.io") lang:en -is:retweet' },
  { topic: "Observability",        query: '(observability OR opentelemetry OR "distributed tracing") lang:en -is:retweet' },
  { topic: "Platform engineering", query: '("platform engineering" OR "internal developer platform" OR "backstage io") lang:en -is:retweet' },
  { topic: "AI coding",            query: '("ai coding" OR "ai code" OR "cursor ide" OR "claude code") lang:en -is:retweet' },
  { topic: "Tech debt",            query: '("technical debt" OR "tech debt") lang:en -is:retweet' },
  { topic: "Frontend AI",          query: '("frontend ai" OR "server components" OR "streaming ui") lang:en -is:retweet' },
  { topic: "Foundation models",    query: '("foundation model" OR "frontier model" OR nanochat) lang:en -is:retweet' },
];

const PER_QUERY_MAX = 20;
const MIN_IMPRESSIONS = 200;

type XUser = { id: string; username: string; name: string; verified?: boolean };
type XTweet = {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics?: {
    impression_count?: number;
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
    bookmark_count?: number;
    quote_count?: number;
  };
};

// Row shape targeting canonical public.social_mention. The tweet id becomes
// platform_post_id; we generate our own row uuid. raw holds the full tweet.
type MentionRow = {
  platform_post_id: string;
  platform: "X";
  author_username: string | null;
  author_name: string | null;
  author_verified: boolean;
  text: string;
  url: string | null;
  topic: string;
  query: string;
  impression_count: number;
  like_count: number;
  reply_count: number;
  retweet_count: number;
  bookmark_count: number;
  quote_count: number;
  reach_score: number;
  posted_at: string;
  fetched_at: string;
  raw: Record<string, unknown>;
};

export type RefreshResult = {
  ok: boolean;
  duration_ms: number;
  queries_run: number;
  posts_upserted: number;
  per_topic: Array<{ topic: string; count: number }>;
  errors: Array<{ stage: string; detail: string }>;
};

function calcReach(m: NonNullable<XTweet["public_metrics"]>): number {
  const imp   = m.impression_count ?? 0;
  const like  = m.like_count       ?? 0;
  const rt    = m.retweet_count    ?? 0;
  const reply = m.reply_count      ?? 0;
  const quote = m.quote_count      ?? 0;
  return imp + like * 10 + rt * 30 + reply * 5 + quote * 20;
}

async function xSearch(query: string, bearer: string): Promise<{ tweets: XTweet[]; users: Map<string, XUser> }> {
  const params = new URLSearchParams({
    query,
    max_results: String(PER_QUERY_MAX),
    expansions: "author_id",
    "tweet.fields": "public_metrics,created_at",
    "user.fields": "username,name,verified",
  });
  const url = `${X_API_BASE}/2/tweets/search/recent?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`X ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const tweets: XTweet[] = data.data ?? [];
  const users = new Map<string, XUser>();
  for (const u of (data.includes?.users ?? []) as XUser[]) users.set(u.id, u);
  return { tweets, users };
}

function buildRow(tweet: XTweet, users: Map<string, XUser>, topic: string, query: string): MentionRow | null {
  const m = tweet.public_metrics;
  if (!m || (m.impression_count ?? 0) < MIN_IMPRESSIONS) return null;
  const author = users.get(tweet.author_id);
  const url = author?.username ? `https://x.com/${author.username}/status/${tweet.id}` : null;
  return {
    platform_post_id: tweet.id,
    platform: "X",
    author_username: author?.username ?? null,
    author_name:     author?.name     ?? null,
    author_verified: !!author?.verified,
    text:            (tweet.text ?? "").slice(0, 2000),
    url,
    topic,
    query,
    impression_count: m.impression_count ?? 0,
    like_count:       m.like_count       ?? 0,
    reply_count:      m.reply_count      ?? 0,
    retweet_count:    m.retweet_count    ?? 0,
    bookmark_count:   m.bookmark_count   ?? 0,
    quote_count:      m.quote_count      ?? 0,
    reach_score:      calcReach(m),
    posted_at:        tweet.created_at,
    fetched_at:       new Date().toISOString(),
    raw:              { tweet, author: author ?? null },
  };
}

/**
 * Upsert into public.social_mention on the (platform, platform_post_id) unique index.
 * Returns { inserted, updated } counts based on xmax (Postgres MVCC trick — xmax=0 on
 * fresh inserts, non-zero on updates). Runs in a single round-trip using multi-row
 * INSERT ... ON CONFLICT.
 */
async function upsertMentions(rows: MentionRow[]): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  // Build parallel column arrays for a single INSERT. Each row also gets a fresh uuid.
  const values = rows.map((r) => ({
    id:                randomUUID(),
    platform:          r.platform,
    platform_post_id:  r.platform_post_id,
    topic:             r.topic,
    query:             r.query,
    url:               r.url,
    text:              r.text,
    author_name:       r.author_name,
    author_username:   r.author_username,
    author_verified:   r.author_verified,
    posted_at:         r.posted_at,
    fetched_at:        r.fetched_at,
    like_count:        r.like_count,
    reply_count:       r.reply_count,
    retweet_count:     r.retweet_count,
    quote_count:       r.quote_count,
    bookmark_count:    r.bookmark_count,
    impression_count:  r.impression_count,
    reach_score:       r.reach_score,
    raw:               JSON.stringify(r.raw),
  }));

  const cols = [
    "id","platform","platform_post_id","topic","query","url","text",
    "author_name","author_username","author_verified","posted_at","fetched_at",
    "like_count","reply_count","retweet_count","quote_count","bookmark_count",
    "impression_count","reach_score","raw",
  ] as const;

  try {
    const results = await sql`
      insert into public.social_mention ${sql(values, ...cols)}
      on conflict (platform, platform_post_id) do update set
        topic            = excluded.topic,
        query            = excluded.query,
        url              = excluded.url,
        text             = excluded.text,
        author_name      = excluded.author_name,
        author_username  = excluded.author_username,
        author_verified  = excluded.author_verified,
        posted_at        = excluded.posted_at,
        fetched_at       = excluded.fetched_at,
        like_count       = excluded.like_count,
        reply_count      = excluded.reply_count,
        retweet_count    = excluded.retweet_count,
        quote_count      = excluded.quote_count,
        bookmark_count   = excluded.bookmark_count,
        impression_count = excluded.impression_count,
        reach_score      = excluded.reach_score,
        raw              = excluded.raw
      returning (xmax = 0) as inserted
    `;
    let inserted = 0, updated = 0;
    for (const r of results as unknown as Array<{ inserted: boolean }>) {
      if (r.inserted) inserted++; else updated++;
    }
    return { inserted, updated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`social_mention upsert failed: ${msg}`);
  }
}

/**
 * Insert one row into public.social_refresh_log. Never throws — a log failure must
 * not fail the refresh itself.
 */
async function logRefresh(entry: {
  duration_ms: number;
  queries_run: number;
  posts_inserted: number;
  posts_updated: number;
  errors: unknown[] | null;
}): Promise<void> {
  try {
    await sql`
      insert into public.social_refresh_log (
        id, ran_at, duration_ms, queries_run, posts_inserted, posts_updated, errors
      ) values (
        ${randomUUID()}, now(),
        ${entry.duration_ms}, ${entry.queries_run},
        ${entry.posts_inserted}, ${entry.posts_updated},
        ${entry.errors ? sql.json(entry.errors as unknown as Parameters<typeof sql.json>[0]) : null}
      )
    `;
  } catch {
    // Log failure never blocks refresh.
  }
}

export async function refreshSocialMentions(): Promise<RefreshResult> {
  const started = Date.now();
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) {
    return {
      ok: false,
      duration_ms: Date.now() - started,
      queries_run: 0,
      posts_upserted: 0,
      per_topic: [],
      errors: [{ stage: "config", detail: "X_BEARER_TOKEN is not set in this environment" }],
    };
  }

  const allRows: MentionRow[] = [];
  const perTopic: Array<{ topic: string; count: number }> = [];
  const errors: Array<{ stage: string; detail: string }> = [];
  let queriesRun = 0;

  // Sequential (not parallel) to avoid tripping X rate limits on a Free/Basic tier.
  for (const { topic, query } of TOPIC_QUERIES) {
    try {
      const { tweets, users } = await xSearch(query, bearer);
      const rows = tweets.map((t) => buildRow(t, users, topic, query)).filter((r): r is MentionRow => r !== null);
      allRows.push(...rows);
      perTopic.push({ topic, count: rows.length });
      queriesRun++;
    } catch (e) {
      errors.push({ stage: `search:${topic}`, detail: e instanceof Error ? e.message : String(e) });
      perTopic.push({ topic, count: 0 });
    }
  }

  // Dedupe by tweet id — same tweet can match multiple topic queries.
  // Keep the FIRST occurrence so topic assignment is deterministic (topic order = TOPIC_QUERIES order).
  const seen = new Map<string, MentionRow>();
  for (const r of allRows) if (!seen.has(r.platform_post_id)) seen.set(r.platform_post_id, r);
  const deduped = Array.from(seen.values());

  let inserted = 0;
  let updated = 0;
  if (deduped.length > 0) {
    try {
      const counts = await upsertMentions(deduped);
      inserted = counts.inserted;
      updated = counts.updated;
    } catch (e) {
      errors.push({ stage: "neon-upsert", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  const duration_ms = Date.now() - started;
  await logRefresh({
    duration_ms,
    queries_run: queriesRun,
    posts_inserted: errors.some((e) => e.stage === "neon-upsert") ? 0 : inserted,
    posts_updated:  errors.some((e) => e.stage === "neon-upsert") ? 0 : updated,
    errors: errors.length ? errors : null,
  });

  return {
    ok: errors.length === 0,
    duration_ms,
    queries_run: queriesRun,
    posts_upserted: errors.some((e) => e.stage === "neon-upsert") ? 0 : inserted + updated,
    per_topic: perTopic,
    errors,
  };
}
