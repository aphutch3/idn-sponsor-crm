// Diff engine: compare two Parsed snapshots and emit typed signals.
// Signal kinds must match the linkedin_signal_kind enum in migration 0003.

import type { Parsed, ParsedCompanyPage, ParsedProfilePublic } from "./parse";
import { createHash } from "node:crypto";

export type LinkedinSignalKind =
  | "headline_change"
  | "headcount_change"
  | "about_change"
  | "new_post"
  | "new_position"
  | "company_added"
  | "bio_update"
  | "website_change"
  | "other";

export type DetectedSignal = {
  readonly signal_kind: LinkedinSignalKind;
  readonly before_value: unknown;
  readonly after_value: unknown;
  readonly field: string;
};

/** Deterministic hash over the parsed fields (not raw HTML). */
export function hashParsed(parsed: Parsed): string {
  // Sort keys so hash is stable across insertion order.
  const stable = JSON.stringify(parsed, Object.keys(parsed).sort());
  return createHash("sha256").update(stable).digest("hex");
}

const changed = (a: unknown, b: unknown): boolean => {
  if (a === b) return false;
  if (a == null && b == null) return false;
  if (typeof a === "string" && typeof b === "string") return a.trim() !== b.trim();
  return a !== b;
};

function diffCompanyPage(prev: ParsedCompanyPage, next: ParsedCompanyPage): readonly DetectedSignal[] {
  const out: DetectedSignal[] = [];

  if (changed(prev.tagline, next.tagline)) {
    out.push({
      signal_kind: "about_change",
      field: "tagline",
      before_value: prev.tagline ?? null,
      after_value: next.tagline ?? null,
    });
  }
  if (changed(prev.headcount_range, next.headcount_range)) {
    out.push({
      signal_kind: "headcount_change",
      field: "headcount_range",
      before_value: prev.headcount_range ?? null,
      after_value: next.headcount_range ?? null,
    });
  }
  if (changed(prev.about, next.about)) {
    out.push({
      signal_kind: "about_change",
      field: "about",
      before_value: prev.about ?? null,
      after_value: next.about ?? null,
    });
  }
  if (changed(prev.website, next.website)) {
    out.push({
      signal_kind: "website_change",
      field: "website",
      before_value: prev.website ?? null,
      after_value: next.website ?? null,
    });
  }
  if (changed(prev.industry, next.industry)) {
    out.push({
      signal_kind: "other",
      field: "industry",
      before_value: prev.industry ?? null,
      after_value: next.industry ?? null,
    });
  }
  if (changed(prev.hq_location, next.hq_location)) {
    out.push({
      signal_kind: "other",
      field: "hq_location",
      before_value: prev.hq_location ?? null,
      after_value: next.hq_location ?? null,
    });
  }
  return out;
}

function diffProfilePublic(prev: ParsedProfilePublic, next: ParsedProfilePublic): readonly DetectedSignal[] {
  const out: DetectedSignal[] = [];

  if (changed(prev.headline, next.headline)) {
    out.push({
      signal_kind: "headline_change",
      field: "headline",
      before_value: prev.headline ?? null,
      after_value: next.headline ?? null,
    });
  }
  if (changed(prev.about_excerpt, next.about_excerpt)) {
    out.push({
      signal_kind: "bio_update",
      field: "about_excerpt",
      before_value: prev.about_excerpt ?? null,
      after_value: next.about_excerpt ?? null,
    });
  }
  if (changed(prev.location, next.location)) {
    out.push({
      signal_kind: "other",
      field: "location",
      before_value: prev.location ?? null,
      after_value: next.location ?? null,
    });
  }
  return out;
}

/**
 * Diff two Parsed snapshots. `prev` may be null (first snapshot ever) —
 * in that case no signals are emitted (we just record the baseline).
 */
export function diff(prev: Parsed | null, next: Parsed): readonly DetectedSignal[] {
  if (!prev) return [];
  if (prev.kind !== next.kind) return []; // ignore kind mismatch (should never happen)
  if (next.kind === "company_page" && prev.kind === "company_page")   return diffCompanyPage(prev, next);
  if (next.kind === "profile_public" && prev.kind === "profile_public") return diffProfilePublic(prev, next);
  return [];
}
