// Apify HTTP client — thin wrapper over the run-sync-get-dataset-items endpoint.
// Requires APIFY_TOKEN. Never throws — every error is captured in the result.

export type ApifyRunInput = {
  readonly actorId: string;           // e.g. "automation-lab~linkedin-company-scraper"
  readonly input: Record<string, unknown>;
  readonly timeoutMs?: number;        // wall time we're willing to wait for a sync call
  readonly memoryMbytes?: number;     // 128, 256, 512, 1024, 2048, 4096, 8192
  readonly maxTotalChargeUsd?: number; // safety cap for pay-per-event actors
};

export type ApifyRunSuccess<T = unknown> = {
  readonly success: true;
  readonly actorId: string;
  readonly items: readonly T[];
};

export type ApifyRunError = {
  readonly success: false;
  readonly actorId: string;
  readonly status_code?: number;
  readonly error: string;
  readonly rate_limited: boolean;
  readonly quota_exhausted: boolean;
};

export type ApifyRunResult<T = unknown> = ApifyRunSuccess<T> | ApifyRunError;

const APIFY_BASE = "https://api.apify.com/v2";
const DEFAULT_SYNC_TIMEOUT_MS = 120_000; // 2 min — safely below Apify's 5 min sync ceiling

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

/** Convert "owner/actor-name" to the actor-id form Apify wants ("owner~actor-name"). */
export function actorSlug(input: string): string {
  return input.replace("/", "~");
}

/**
 * Runs an Apify actor synchronously and returns its default dataset items.
 * Uses run-sync-get-dataset-items. Never throws.
 */
export async function runActorSync<T = unknown>(input: ApifyRunInput): Promise<ApifyRunResult<T>> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      success: false,
      actorId: input.actorId,
      error: "APIFY_TOKEN not set",
      rate_limited: false,
      quota_exhausted: false,
    };
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;
  const timeoutSec = Math.max(30, Math.min(300, Math.floor(timeoutMs / 1000)));

  const url = new URL(`${APIFY_BASE}/acts/${input.actorId}/run-sync-get-dataset-items`);
  url.searchParams.set("timeout", String(timeoutSec));
  if (input.memoryMbytes) url.searchParams.set("memory", String(input.memoryMbytes));
  if (input.maxTotalChargeUsd != null) {
    url.searchParams.set("maxTotalChargeUsd", String(input.maxTotalChargeUsd));
  }
  url.searchParams.set("clean", "true");
  url.searchParams.set("format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 5_000);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.input),
      signal: controller.signal,
    });

    if (res.status === 429) {
      return {
        success: false,
        actorId: input.actorId,
        status_code: 429,
        error: "Apify rate-limited (429)",
        rate_limited: true,
        quota_exhausted: false,
      };
    }
    if (res.status === 402 || res.status === 403) {
      const body = await res.text();
      const quota = /quota|credit|limit/i.test(body);
      return {
        success: false,
        actorId: input.actorId,
        status_code: res.status,
        error: `Apify ${res.status}: ${body.slice(0, 300)}`,
        rate_limited: false,
        quota_exhausted: quota,
      };
    }

    if (!res.ok) {
      const body = await res.text();
      return {
        success: false,
        actorId: input.actorId,
        status_code: res.status,
        error: `Apify HTTP ${res.status}: ${body.slice(0, 300)}`,
        rate_limited: false,
        quota_exhausted: false,
      };
    }

    const bodyText = await res.text();
    let items: unknown;
    try { items = JSON.parse(bodyText); } catch {
      return {
        success: false,
        actorId: input.actorId,
        status_code: res.status,
        error: `non-JSON response: ${bodyText.slice(0, 200)}`,
        rate_limited: false,
        quota_exhausted: false,
      };
    }
    if (!Array.isArray(items)) {
      return {
        success: false,
        actorId: input.actorId,
        status_code: res.status,
        error: `expected array of items, got ${typeof items}`,
        rate_limited: false,
        quota_exhausted: false,
      };
    }

    return {
      success: true,
      actorId: input.actorId,
      items: items as readonly T[],
    };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    const isAbort = err?.name === "AbortError";
    return {
      success: false,
      actorId: input.actorId,
      error: isAbort ? `timeout after ${timeoutMs}ms` : String(err?.message ?? e),
      rate_limited: false,
      quota_exhausted: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
