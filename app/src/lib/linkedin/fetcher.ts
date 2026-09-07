// LinkedIn fetch router.
// Decides which provider to use per URL. Firecrawl gets 403 on linkedin.com,
// so LinkedIn URLs go to Apify's no-cookie public actors. Other hosts (if we
// ever monitor them) fall back to Firecrawl.

import { scrapeUrl as firecrawlScrape, type ScrapeResponse } from "@/lib/firecrawl/client";
import { scrapeLinkedinUrl, apifyLinkedinConfigured } from "@/lib/apify/linkedin-actors";
import type { LinkedinFetchType } from "./urls";

export type FetchResult = ScrapeResponse;

function isLinkedinHost(url: string): boolean {
  try { return new URL(url).hostname.toLowerCase().endsWith("linkedin.com"); }
  catch { return false; }
}

/**
 * Fetch one URL for one fetch_type. Provider is chosen per URL host.
 * Returns a shape compatible with what runMonitor expects.
 */
export async function fetchOne(url: string, fetchType: LinkedinFetchType): Promise<FetchResult> {
  if (isLinkedinHost(url)) {
    // Only company_page and profile_public are wired to Apify actors so far.
    // Other fetch types (posts / people / activity) fall through to Firecrawl,
    // which will return a 403 the worker records for observability.
    if (fetchType === "company_page" || fetchType === "profile_public") {
      if (!apifyLinkedinConfigured()) {
        return {
          success: false,
          url,
          error: "APIFY_TOKEN not set — cannot fetch LinkedIn",
          rate_limited: false,
          blocked: false,
        };
      }
      const r = await scrapeLinkedinUrl(url, fetchType);
      // Cast is safe: LinkedinScrapeResponse is a structural subset of ScrapeResponse.
      return r as FetchResult;
    }
    return {
      success: false,
      url,
      error: `fetch_type ${fetchType} not yet wired for LinkedIn`,
      rate_limited: false,
      blocked: false,
    };
  }

  // Non-LinkedIn: use Firecrawl
  return await firecrawlScrape({
    url,
    formats: ["markdown", "html"],
    onlyMainContent: true,
    waitFor: 1500,
  });
}
