// LinkedIn parsers per fetch_type.
// Extracts only stable, comparison-worthy fields from Firecrawl output.
// Deliberately conservative: unknown structure → empty parsed object rather than
// noisy false-positive signals downstream.

import type { LinkedinFetchType } from "./urls";

export type ParsedCompanyPage = {
  readonly kind: "company_page";
  readonly name?: string;
  readonly tagline?: string;
  readonly about?: string;      // trimmed to 800 chars
  readonly industry?: string;
  readonly headcount_range?: string;
  readonly hq_location?: string;
  readonly website?: string;
  readonly followers?: string;  // "12,345 followers"
};

export type ParsedProfilePublic = {
  readonly kind: "profile_public";
  readonly name?: string;
  readonly headline?: string;
  readonly location?: string;
  readonly about_excerpt?: string; // trimmed to 500 chars
};

export type ParsedOther = { readonly kind: "other"; readonly title?: string };

export type Parsed = ParsedCompanyPage | ParsedProfilePublic | ParsedOther;

const norm = (s: string | undefined | null): string | undefined => {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, " ").trim();
  return t || undefined;
};

const clip = (s: string | undefined, n: number): string | undefined => {
  if (!s) return undefined;
  return s.length > n ? s.slice(0, n) : s;
};

// ---- Company page ----------------------------------------------------------

function parseCompanyPage(markdown: string | undefined, meta: Record<string, unknown>): ParsedCompanyPage {
  const md = markdown ?? "";
  const metaTitle = norm(meta["title"] as string | undefined);
  const metaDesc = norm(meta["description"] as string | undefined);
  const ogSite = norm(meta["og:site_name"] as string | undefined);

  // First non-empty markdown line is usually the company name (h1)
  const firstHeading = md
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "");

  const name = norm(firstHeading) ?? metaTitle?.replace(/\s*\|\s*LinkedIn.*$/i, "") ?? ogSite;

  // Structured lines LinkedIn's public page usually renders:
  //   Industry\n<value>\nCompany size\n<value>\nHeadquarters\n<value>\nWebsite\n<url>\nFollowers\n<value>
  const labelValue = (label: RegExp): string | undefined => {
    const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length - 1; i++) {
      if (label.test(lines[i]!)) return norm(lines[i + 1]);
    }
    return undefined;
  };

  const industry       = labelValue(/^industry$/i);
  const headcount      = labelValue(/^company size$/i);
  const hq             = labelValue(/^headquarters$/i);
  const website        = labelValue(/^website$/i);
  const followers      = labelValue(/^followers$/i);

  // Tagline: LinkedIn's og:description or the meta description is the company tagline.
  const tagline = norm(meta["og:description"] as string | undefined) ?? metaDesc;

  // About: usually the largest block after "About" or "Overview" heading
  let about: string | undefined;
  const aboutIdx = md.search(/\n#{2,4}\s+(About|Overview)\s*\n/i);
  if (aboutIdx >= 0) {
    const after = md.slice(aboutIdx).replace(/\n#{2,4}\s+(About|Overview)\s*\n/i, "");
    const nextHeading = after.search(/\n#{1,4}\s+/);
    const chunk = nextHeading >= 0 ? after.slice(0, nextHeading) : after;
    about = clip(norm(chunk), 800);
  }

  return {
    kind: "company_page",
    ...(name              ? { name } : {}),
    ...(tagline           ? { tagline } : {}),
    ...(about             ? { about } : {}),
    ...(industry          ? { industry } : {}),
    ...(headcount         ? { headcount_range: headcount } : {}),
    ...(hq                ? { hq_location: hq } : {}),
    ...(website           ? { website } : {}),
    ...(followers         ? { followers } : {}),
  };
}

// ---- Profile public --------------------------------------------------------

function parseProfilePublic(markdown: string | undefined, meta: Record<string, unknown>): ParsedProfilePublic {
  const md = markdown ?? "";
  const metaTitle = norm(meta["title"] as string | undefined);
  const metaDesc  = norm(meta["description"] as string | undefined);

  const firstHeading = md
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "");

  const name = norm(firstHeading) ?? metaTitle?.replace(/\s*\|\s*LinkedIn.*$/i, "");

  // Headline is often the line right after the name heading, or in og:description prefix.
  let headline: string | undefined;
  const lines = md.split("\n").map((l) => l.trim());
  const nameLineIdx = lines.findIndex((l) => /^#\s+/.test(l));
  if (nameLineIdx >= 0) {
    for (let i = nameLineIdx + 1; i < Math.min(nameLineIdx + 6, lines.length); i++) {
      const cand = lines[i];
      if (cand && cand.length > 10 && cand.length < 220 && !cand.startsWith("#") && !cand.startsWith("[")) {
        headline = norm(cand);
        break;
      }
    }
  }
  if (!headline) headline = norm(meta["og:description"] as string | undefined) ?? metaDesc;

  // Location: LinkedIn public profiles typically show "City, Country · Contact info" — grab first city line
  let location: string | undefined;
  const locMatch = md.match(/\n([A-Z][A-Za-z .'-]+,\s*[A-Za-z .'-]+(?:,\s*[A-Za-z .'-]+)?)\s*\n/);
  if (locMatch?.[1]) location = norm(locMatch[1]);

  let about_excerpt: string | undefined;
  const aboutIdx = md.search(/\n#{2,4}\s+About\s*\n/i);
  if (aboutIdx >= 0) {
    const after = md.slice(aboutIdx).replace(/\n#{2,4}\s+About\s*\n/i, "");
    const nextHeading = after.search(/\n#{1,4}\s+/);
    const chunk = nextHeading >= 0 ? after.slice(0, nextHeading) : after;
    about_excerpt = clip(norm(chunk), 500);
  }

  return {
    kind: "profile_public",
    ...(name          ? { name } : {}),
    ...(headline      ? { headline } : {}),
    ...(location      ? { location } : {}),
    ...(about_excerpt ? { about_excerpt } : {}),
  };
}

// ---- Router ----------------------------------------------------------------

export function parseFetch(
  fetchType: LinkedinFetchType,
  markdown: string | undefined,
  metadata: Record<string, unknown> | undefined,
): Parsed {
  const meta = metadata ?? {};
  switch (fetchType) {
    case "company_page":   return parseCompanyPage(markdown, meta);
    case "profile_public": return parseProfilePublic(markdown, meta);
    // Other fetch types get a minimal "other" parsed record for now;
    // they still get snapshotted and hashed, we just don't emit typed field diffs yet.
    case "company_posts":
    case "company_people":
    case "profile_activity": {
      const title = norm((meta["title"] as string | undefined) ?? "");
      return { kind: "other", ...(title ? { title } : {}) };
    }
  }
}
