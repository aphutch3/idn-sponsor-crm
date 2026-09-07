// Firecrawl HTTP client.
// Direct calls to Firecrawl's REST API using FIRECRAWL_API_KEY.
// Isolated from the MCP-style connector — this runs on Vercel with its own key.

export type FirecrawlScrapeInput = {
  readonly url: string;
  readonly formats?: readonly ("markdown" | "html" | "raw_html" | "screenshot" | "links")[];
  readonly onlyMainContent?: boolean;
  readonly waitFor?: number; // ms
  readonly timeout?: number; // ms
  readonly headers?: Readonly<Record<string, string>>;
  readonly mobile?: boolean;
  readonly removeBase64Images?: boolean;
};

export type FirecrawlScrapeResult = {
  readonly success: true;
  readonly url: string;
  readonly status_code: number;
  readonly markdown?: string;
  readonly html?: string;
  readonly raw_html?: string;
  readonly links?: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type FirecrawlScrapeError = {
  readonly success: false;
  readonly url: string;
  readonly status_code?: number;
  readonly error: string;
  readonly rate_limited: boolean;
  readonly blocked: boolean; // 403/451/999 → LinkedIn abuse signal
};

export type ScrapeResponse = FirecrawlScrapeResult | FirecrawlScrapeError;

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";
const DEFAULT_TIMEOUT_MS = 45_000;

export function firecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

/** Single URL scrape. Never throws — always returns ScrapeResponse. */
export async function scrapeUrl(input: FirecrawlScrapeInput): Promise<ScrapeResponse> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    return {
      success: false,
      url: input.url,
      error: "FIRECRAWL_API_KEY not set",
      rate_limited: false,
      blocked: false,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: input.url,
        formats: input.formats ?? ["markdown", "html"],
        onlyMainContent: input.onlyMainContent ?? true,
        waitFor: input.waitFor ?? 1500,
        timeout: input.timeout ?? DEFAULT_TIMEOUT_MS,
        headers: input.headers,
        mobile: input.mobile ?? false,
        removeBase64Images: input.removeBase64Images ?? true,
      }),
      signal: controller.signal,
    });

    // Rate limit / block detection at the Firecrawl-transport layer
    if (res.status === 429) {
      return {
        success: false,
        url: input.url,
        status_code: res.status,
        error: "Firecrawl rate-limited (429)",
        rate_limited: true,
        blocked: false,
      };
    }

    const bodyText = await res.text();
    let json: unknown;
    try { json = JSON.parse(bodyText); } catch {
      return {
        success: false,
        url: input.url,
        status_code: res.status,
        error: `non-JSON response (${res.status}): ${bodyText.slice(0, 200)}`,
        rate_limited: false,
        blocked: false,
      };
    }

    const j = json as {
      success?: boolean;
      error?: string;
      data?: {
        markdown?: string;
        html?: string;
        rawHtml?: string;
        links?: string[];
        metadata?: Record<string, unknown> & { statusCode?: number; sourceURL?: string };
      };
    };

    if (!j.success || !j.data) {
      const upstreamStatus = j.data?.metadata?.statusCode;
      const blocked = upstreamStatus === 403 || upstreamStatus === 451 || upstreamStatus === 999;
      return {
        success: false,
        url: input.url,
        status_code: upstreamStatus ?? res.status,
        error: j.error ?? `Firecrawl returned success=false`,
        rate_limited: false,
        blocked,
      };
    }

    const upstreamStatus = j.data.metadata?.statusCode ?? res.status;
    // LinkedIn returns 999 to abuse-suspected clients, 429 to rate-limited ones
    if (upstreamStatus === 429 || upstreamStatus === 999) {
      return {
        success: false,
        url: input.url,
        status_code: upstreamStatus,
        error: `LinkedIn upstream ${upstreamStatus} (abuse or rate limit)`,
        rate_limited: upstreamStatus === 429,
        blocked: upstreamStatus === 999,
      };
    }
    if (upstreamStatus === 403 || upstreamStatus === 451) {
      return {
        success: false,
        url: input.url,
        status_code: upstreamStatus,
        error: `LinkedIn upstream ${upstreamStatus} (blocked)`,
        rate_limited: false,
        blocked: true,
      };
    }

    return {
      success: true,
      url: input.url,
      status_code: upstreamStatus,
      markdown: j.data.markdown,
      html: j.data.html,
      raw_html: j.data.rawHtml,
      links: j.data.links,
      metadata: j.data.metadata ?? {},
    };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    const isAbort = err?.name === "AbortError";
    return {
      success: false,
      url: input.url,
      error: isAbort ? `timeout after ${input.timeout ?? DEFAULT_TIMEOUT_MS}ms` : String(err?.message ?? e),
      rate_limited: false,
      blocked: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
