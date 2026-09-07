// Server-only. Runs the same X-search-to-Supabase pipeline that
// scripts/refresh_social_mentions.py runs on the 6h cron, but in TypeScript
// so it can be triggered from the Next.js API route (Refresh now button).

import "server-only";

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

type MentionRow = {
  id: string;
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
    // Never cache — always hit live.
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
    id: tweet.id,
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
  };
}

async function supabaseUpsert(rows: MentionRow[]): Promise<void> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/social_mentions?on_conflict=id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase upsert ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function supabaseLog(entry: {
  duration_ms: number;
  queries_run: number;
  posts_inserted: number;
  errors: unknown[] | null;
}): Promise<void> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/social_refresh_log`;
  await fetch(url, {
    method: "POST",
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify([entry]),
    cache: "no-store",
  }).catch(() => { /* log failure never blocks refresh */ });
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
  const seen = new Map<string, MentionRow>();
  for (const r of allRows) if (!seen.has(r.id)) seen.set(r.id, r);
  const deduped = Array.from(seen.values());

  if (deduped.length > 0) {
    try {
      await supabaseUpsert(deduped);
    } catch (e) {
      errors.push({ stage: "supabase-upsert", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  const duration_ms = Date.now() - started;
  await supabaseLog({
    duration_ms,
    queries_run: queriesRun,
    posts_inserted: errors.some((e) => e.stage === "supabase-upsert") ? 0 : deduped.length,
    errors: errors.length ? errors : null,
  });

  return {
    ok: errors.length === 0,
    duration_ms,
    queries_run: queriesRun,
    posts_upserted: errors.some((e) => e.stage === "supabase-upsert") ? 0 : deduped.length,
    per_topic: perTopic,
    errors,
  };
}
