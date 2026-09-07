// Apify LinkedIn actor wrappers.
// Turn a LinkedIn URL into a normalized ScrapeResponse (same shape as
// the Firecrawl client) so downstream code stays fetcher-agnostic.
//
// Actors used (no-cookie, public-data-only):
//   automation-lab/linkedin-company-scraper  — company pages, ~$0.003/company
//   harvestapi/linkedin-profile-scraper       — profiles, $4/1K
//
// Envs allow overriding actor IDs so we can swap without a code change.

import { runActorSync, actorSlug, apifyConfigured } from "./client";
import type { LinkedinFetchType } from "@/lib/linkedin/urls";

// Shape returned to the monitor — deliberately mirrors FirecrawlScrapeResult /
// FirecrawlScrapeError so runMonitor doesn't care which fetcher ran.
export type LinkedinScrapeSuccess = {
  readonly success: true;
  readonly url: string;
  readonly status_code: number;
  readonly markdown?: string;      // synthesized from parsed fields
  readonly html?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type LinkedinScrapeFailure = {
  readonly success: false;
  readonly url: string;
  readonly status_code?: number;
  readonly error: string;
  readonly rate_limited: boolean;
  readonly blocked: boolean;
};

export type LinkedinScrapeResponse = LinkedinScrapeSuccess | LinkedinScrapeFailure;

export function apifyLinkedinConfigured(): boolean {
  return apifyConfigured();
}

const COMPANY_ACTOR =
  process.env.APIFY_LINKEDIN_COMPANY_ACTOR ?? actorSlug("automation-lab/linkedin-company-scraper");
const PROFILE_ACTOR =
  process.env.APIFY_LINKEDIN_PROFILE_ACTOR ?? actorSlug("harvestapi/linkedin-profile-scraper");

const MAX_CHARGE_PER_CALL_USD = Number(process.env.APIFY_MAX_CHARGE_PER_CALL_USD ?? "0.05");

// ------------------------------------------------------------------
// Field-to-markdown synthesis
// ------------------------------------------------------------------
// Our LinkedIn parsers (lib/linkedin/parse.ts) work off Firecrawl-style
// markdown. Rather than write two parsers, we synthesize markdown from
// Apify's structured item so the existing parser keeps working end-to-end.
// ------------------------------------------------------------------

const line = (label: string, val: unknown): string =>
  val == null || val === "" ? "" : `${label}\n${String(val)}\n\n`;

function companyItemToMarkdown(item: Record<string, unknown>): { md: string; meta: Record<string, unknown> } {
  const name = firstNonEmpty(item, ["name", "companyName", "title"]);
  const tagline = firstNonEmpty(item, ["tagline", "description", "shortDescription", "summary"]);
  const about = firstNonEmpty(item, ["about", "aboutUs", "overview", "descriptionLong"]);
  const industry = firstNonEmpty(item, ["industry", "industries"]);
  const size = firstNonEmpty(item, ["companySize", "size", "employeeCount", "employees", "employeeCountRange"]);
  const hq = firstNonEmpty(item, ["headquarters", "hq", "location", "hqLocation", "address"]);
  const website = firstNonEmpty(item, ["website", "websiteUrl", "url"]);
  const followers = firstNonEmpty(item, ["followers", "followerCount"]);

  const md =
    (name ? `# ${name}\n\n` : "") +
    (tagline ? `${tagline}\n\n` : "") +
    (about ? `## About\n\n${about}\n\n` : "") +
    line("Industry", industry) +
    line("Company size", formatSize(size)) +
    line("Headquarters", hq) +
    line("Website", website) +
    line("Followers", formatFollowers(followers));

  const meta: Record<string, unknown> = {
    title: name ? `${name} | LinkedIn` : undefined,
    description: tagline,
    "og:description": tagline,
    "og:site_name": name,
    apify_source_actor: COMPANY_ACTOR,
  };
  return { md, meta };
}

function profileItemToMarkdown(item: Record<string, unknown>): { md: string; meta: Record<string, unknown> } {
  const name = firstNonEmpty(item, ["fullName", "name", "displayName"]) ??
               [firstNonEmpty(item, ["firstName"]), firstNonEmpty(item, ["lastName"])].filter(Boolean).join(" ");
  const headline = firstNonEmpty(item, ["headline", "occupation", "title", "subtitle"]);
  const location = firstNonEmpty(item, ["location", "geoLocation", "addressLocality", "city"]);
  const about = firstNonEmpty(item, ["about", "summary", "bio", "description"]);

  const md =
    (name ? `# ${name}\n\n` : "") +
    (headline ? `${headline}\n\n` : "") +
    (location ? `\n${location}\n\n` : "") +
    (about ? `## About\n\n${about}\n\n` : "");

  const meta: Record<string, unknown> = {
    title: name ? `${name} | LinkedIn` : undefined,
    description: headline,
    "og:description": headline,
    apify_source_actor: PROFILE_ACTOR,
  };
  return { md, meta };
}

function firstNonEmpty(item: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = item[k];
    if (v == null) continue;
    if (typeof v === "string") { const t = v.trim(); if (t) return t; }
    else if (typeof v === "number") return String(v);
    else if (Array.isArray(v) && v.length) {
      const first = v.find((x) => typeof x === "string" && x.trim().length > 0);
      if (first) return String(first);
    }
    else if (typeof v === "object") {
      const rec = v as Record<string, unknown>;
      const nested = firstNonEmpty(rec, ["name", "text", "value", "displayName", "city", "country"]);
      if (nested) return nested;
    }
  }
  return undefined;
}

function formatSize(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (/employees?/i.test(raw)) return raw;
  if (/^\d[\d,–\-\s]*$/.test(raw)) return `${raw} employees`;
  return raw;
}

function formatFollowers(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return /followers?/i.test(raw) ? raw : `${raw} followers`;
}

// ------------------------------------------------------------------
// Entry point — one URL, one fetch_type, one normalized response
// ------------------------------------------------------------------

export async function scrapeLinkedinUrl(
  url: string,
  fetchType: LinkedinFetchType,
): Promise<LinkedinScrapeResponse> {
  if (!apifyConfigured()) {
    return { success: false, url, error: "APIFY_TOKEN not set", rate_limited: false, blocked: false };
  }

  // Only two fetch_types are wired end-to-end right now; others are still
  // snapshotted (worker path), but we skip Apify calls we don't support yet.
  if (fetchType !== "company_page" && fetchType !== "profile_public") {
    return {
      success: false,
      url,
      error: `fetch_type ${fetchType} not yet supported via Apify actor`,
      rate_limited: false,
      blocked: false,
    };
  }

  const isCompany = fetchType === "company_page";
  const actorId = isCompany ? COMPANY_ACTOR : PROFILE_ACTOR;
  // Field names differ per actor — defaults target automation-lab/linkedin-company-scraper
  // (which takes `companyUrls`) and harvestapi/linkedin-profile-scraper (which takes `urls`).
  // If a user overrides APIFY_LINKEDIN_*_ACTOR to a different actor, they'll also need to
  // override the field names via APIFY_LINKEDIN_*_URL_FIELD.
  const companyUrlField = process.env.APIFY_LINKEDIN_COMPANY_URL_FIELD ?? "companyUrls";
  const profileUrlField = process.env.APIFY_LINKEDIN_PROFILE_URL_FIELD ?? "urls";
  const input: Record<string, unknown> = isCompany
    ? { [companyUrlField]: [url], maxCompanies: 1, maxConcurrency: 1 }
    : { [profileUrlField]: [url], profileScraperMode: "Profile details no email ($4 per 1k)" };

  const run = await runActorSync<Record<string, unknown>>({
    actorId,
    input,
    timeoutMs: 120_000,
    memoryMbytes: 1024,
    maxTotalChargeUsd: MAX_CHARGE_PER_CALL_USD,
  });

  if (!run.success) {
    return {
      success: false,
      url,
      status_code: run.status_code,
      error: `apify ${actorId}: ${run.error}`,
      rate_limited: run.rate_limited,
      blocked: run.quota_exhausted, // treat as "back off" for the config
    };
  }

  const item = run.items[0];
  if (!item) {
    return {
      success: false,
      url,
      status_code: 204,
      error: `apify ${actorId}: 0 items returned — likely private, deleted, or blocked`,
      rate_limited: false,
      blocked: false,
    };
  }

  const { md, meta } = isCompany ? companyItemToMarkdown(item) : profileItemToMarkdown(item);

  // Attach the raw Apify item into metadata so we can improve parsers later
  // without re-scraping.
  const enrichedMeta: Record<string, unknown> = {
    ...meta,
    apify_raw: item,
  };

  return {
    success: true,
    url,
    status_code: 200,
    markdown: md,
    metadata: enrichedMeta,
  };
}
