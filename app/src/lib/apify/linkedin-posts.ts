// Apify wrappers for LinkedIn posts (company + profile).
//
// Actors:
//   apimaestro/linkedin-company-posts  — input { company_name, limit? }, ~$5/1K posts
//   apimaestro/linkedin-profile-posts  — input { username, total_posts? }, ~$5/1K posts
//
// Both return items with the same core shape: `urn`, `full_urn`, `text`,
// `posted_at.timestamp`, `url`, `stats.total_reactions`, `stats.comments`,
// `stats.reposts`, `media.type`. We normalize to `RawPost`.

import { runActorSync, actorSlug, apifyConfigured } from "./client";

export type RawPost = {
  readonly urn: string;                  // stable per-post id (dedupe key)
  readonly posted_at_iso?: string;
  readonly text?: string;
  readonly url?: string;
  readonly reactions?: number;
  readonly comments?: number;
  readonly reposts?: number;
  readonly media_kind?: string;
  readonly raw: Readonly<Record<string, unknown>>;
};

export type FetchPostsSuccess = {
  readonly ok: true;
  readonly source: "company" | "profile";
  readonly identifier: string;           // slug / username used to fetch
  readonly posts: readonly RawPost[];
};

export type FetchPostsFailure = {
  readonly ok: false;
  readonly source: "company" | "profile";
  readonly identifier: string;
  readonly status_code?: number;
  readonly error: string;
  readonly rate_limited: boolean;
  readonly blocked: boolean;
};

export type FetchPostsResult = FetchPostsSuccess | FetchPostsFailure;

const COMPANY_POSTS_ACTOR =
  process.env.APIFY_LINKEDIN_COMPANY_POSTS_ACTOR ?? actorSlug("apimaestro/linkedin-company-posts");
const PROFILE_POSTS_ACTOR =
  process.env.APIFY_LINKEDIN_PROFILE_POSTS_ACTOR ?? actorSlug("apimaestro/linkedin-profile-posts");

const MAX_CHARGE_PER_CALL_USD = Number(process.env.APIFY_MAX_CHARGE_PER_CALL_USD ?? "0.05");
const DEFAULT_POSTS_PER_FETCH = Number(process.env.LINKEDIN_POSTS_PER_FETCH ?? "20");

// ------------------------------------------------------------------
// URL / slug helpers
// ------------------------------------------------------------------

/** Turn a LinkedIn company URL into a slug: `https://www.linkedin.com/company/ibm/` -> `ibm`. */
export function companySlugFromUrl(url: string): string | undefined {
  const m = url.match(/linkedin\.com\/company\/([^/?#]+)/i);
  return m?.[1]?.trim();
}

/** Turn a LinkedIn profile URL into a username: `.../in/williamhgates/` -> `williamhgates`. */
export function profileUsernameFromUrl(url: string): string | undefined {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m?.[1]?.trim();
}

// ------------------------------------------------------------------
// Item normalization
// ------------------------------------------------------------------

function pickString(rec: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickNumber(rec: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  return undefined;
}

/**
 * Normalize a raw Apify post item into our RawPost shape.
 * Handles nested `posted_at.timestamp`, `stats.*`, `media.type` shapes.
 */
function normalizePost(item: Record<string, unknown>): RawPost | undefined {
  const urn = pickString(item, ["urn", "id", "postId", "post_id"]) ?? pickString(item, ["full_urn"]);
  if (!urn) return undefined;

  const postedAt = item["posted_at"];
  let posted_at_iso: string | undefined;
  if (postedAt && typeof postedAt === "object") {
    const rec = postedAt as Record<string, unknown>;
    const ts = pickNumber(rec, ["timestamp"]);
    if (ts && ts > 0) {
      posted_at_iso = new Date(ts).toISOString();
    } else {
      const date = pickString(rec, ["date"]);
      if (date) {
        const d = new Date(date.replace(" ", "T") + "Z");
        if (!Number.isNaN(d.getTime())) posted_at_iso = d.toISOString();
      }
    }
  } else if (typeof postedAt === "string") {
    const d = new Date(postedAt);
    if (!Number.isNaN(d.getTime())) posted_at_iso = d.toISOString();
  }

  const stats = (item["stats"] && typeof item["stats"] === "object")
    ? (item["stats"] as Record<string, unknown>)
    : {};
  const media = (item["media"] && typeof item["media"] === "object")
    ? (item["media"] as Record<string, unknown>)
    : {};

  return {
    urn,
    posted_at_iso,
    text: pickString(item, ["text", "content", "body"]),
    url: pickString(item, ["url", "postUrl", "post_url"]),
    reactions: pickNumber(stats, ["total_reactions", "reactions", "like"]),
    comments: pickNumber(stats, ["comments", "commentCount"]),
    reposts: pickNumber(stats, ["reposts", "shares", "repostCount"]),
    media_kind: pickString(media, ["type", "kind"]) ?? pickString(item, ["post_type"]),
    raw: item,
  };
}

// ------------------------------------------------------------------
// Fetchers
// ------------------------------------------------------------------

/** Fetch recent posts from a LinkedIn company page. */
export async function fetchCompanyPosts(companyUrl: string, opts?: { limit?: number }): Promise<FetchPostsResult> {
  const slug = companySlugFromUrl(companyUrl);
  if (!slug) {
    return {
      ok: false,
      source: "company",
      identifier: companyUrl,
      error: `could not extract company slug from ${companyUrl}`,
      rate_limited: false,
      blocked: false,
    };
  }
  if (!apifyConfigured()) {
    return {
      ok: false,
      source: "company",
      identifier: slug,
      error: "APIFY_TOKEN not set",
      rate_limited: false,
      blocked: false,
    };
  }

  const limit = Math.max(1, Math.min(100, opts?.limit ?? DEFAULT_POSTS_PER_FETCH));
  const run = await runActorSync<Record<string, unknown>>({
    actorId: COMPANY_POSTS_ACTOR,
    input: { company_name: slug, limit, page_number: 1 },
    timeoutMs: 120_000,
    memoryMbytes: 1024,
    maxTotalChargeUsd: MAX_CHARGE_PER_CALL_USD,
  });

  if (!run.success) {
    return {
      ok: false,
      source: "company",
      identifier: slug,
      status_code: run.status_code,
      error: `apify ${COMPANY_POSTS_ACTOR}: ${run.error}`,
      rate_limited: run.rate_limited,
      blocked: run.quota_exhausted,
    };
  }

  const posts = run.items
    .map((it) => normalizePost(it as Record<string, unknown>))
    .filter((p): p is RawPost => p !== undefined);

  return { ok: true, source: "company", identifier: slug, posts };
}

/** Fetch recent posts from a LinkedIn profile. */
export async function fetchProfilePosts(profileUrl: string, opts?: { limit?: number }): Promise<FetchPostsResult> {
  const username = profileUsernameFromUrl(profileUrl);
  if (!username) {
    return {
      ok: false,
      source: "profile",
      identifier: profileUrl,
      error: `could not extract username from ${profileUrl}`,
      rate_limited: false,
      blocked: false,
    };
  }
  if (!apifyConfigured()) {
    return {
      ok: false,
      source: "profile",
      identifier: username,
      error: "APIFY_TOKEN not set",
      rate_limited: false,
      blocked: false,
    };
  }

  const limit = Math.max(1, Math.min(100, opts?.limit ?? DEFAULT_POSTS_PER_FETCH));
  const run = await runActorSync<Record<string, unknown>>({
    actorId: PROFILE_POSTS_ACTOR,
    input: { username, total_posts: limit, page_number: 1 },
    timeoutMs: 120_000,
    memoryMbytes: 1024,
    maxTotalChargeUsd: MAX_CHARGE_PER_CALL_USD,
  });

  if (!run.success) {
    return {
      ok: false,
      source: "profile",
      identifier: username,
      status_code: run.status_code,
      error: `apify ${PROFILE_POSTS_ACTOR}: ${run.error}`,
      rate_limited: run.rate_limited,
      blocked: run.quota_exhausted,
    };
  }

  const posts = run.items
    .map((it) => normalizePost(it as Record<string, unknown>))
    .filter((p): p is RawPost => p !== undefined);

  return { ok: true, source: "profile", identifier: username, posts };
}
