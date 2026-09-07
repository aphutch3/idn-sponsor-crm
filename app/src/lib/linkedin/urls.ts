// LinkedIn URL derivation.
// Given a company/contact record and a fetch_type, return the public URL to fetch
// (or null if this fetch_type doesn't apply / URL can't be derived).

export type LinkedinFetchType =
  | "company_page"
  | "company_posts"
  | "company_people"
  | "profile_public"
  | "profile_activity";

// Normalizes any LinkedIn URL to https://www.linkedin.com/<path>/ form.
// Rejects Sales Navigator, /login, /uas/, /pub/dir/ etc. (not scrape targets).
export function normalizeLinkedinUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let raw = String(input).trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }

  const host = u.hostname.toLowerCase();
  if (!host.endsWith("linkedin.com")) return null;

  // Force canonical www subdomain
  u.hostname = "www.linkedin.com";
  u.protocol = "https:";
  u.hash = "";
  u.search = ""; // strip trackers

  const path = u.pathname.replace(/\/+$/, ""); // drop trailing slash
  const forbid = ["/login", "/uas/", "/pub/dir", "/checkpoint", "/authwall"];
  if (forbid.some((p) => path.startsWith(p))) return null;

  u.pathname = path;
  return u.toString();
}

/** Extract the /company/{slug} form from any LinkedIn URL. */
export function extractCompanySlug(url: string | null): string | null {
  const norm = normalizeLinkedinUrl(url);
  if (!norm) return null;
  const m = new URL(norm).pathname.match(/^\/company\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** Extract the /in/{slug} form from any LinkedIn profile URL. */
export function extractProfileSlug(url: string | null): string | null {
  const norm = normalizeLinkedinUrl(url);
  if (!norm) return null;
  const m = new URL(norm).pathname.match(/^\/in\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export type UrlBuildResult =
  | { ok: true; url: string }
  | { ok: false; reason: "no_linkedin_url" | "not_applicable" | "invalid_url" };

/** Company fetches: needs a /company/{slug}. */
export function buildCompanyUrl(
  linkedinUrl: string | null | undefined,
  fetchType: Extract<LinkedinFetchType, "company_page" | "company_posts" | "company_people">,
): UrlBuildResult {
  const slug = extractCompanySlug(linkedinUrl ?? null);
  if (!slug) {
    if (!linkedinUrl) return { ok: false, reason: "no_linkedin_url" };
    return { ok: false, reason: "invalid_url" };
  }
  const base = `https://www.linkedin.com/company/${slug}`;
  switch (fetchType) {
    case "company_page":   return { ok: true, url: base };
    case "company_posts":  return { ok: true, url: `${base}/posts/?feedView=all` };
    case "company_people": return { ok: true, url: `${base}/people/` };
  }
}

/** Profile fetches: needs a /in/{slug}. */
export function buildProfileUrl(
  linkedinUrl: string | null | undefined,
  fetchType: Extract<LinkedinFetchType, "profile_public" | "profile_activity">,
): UrlBuildResult {
  const slug = extractProfileSlug(linkedinUrl ?? null);
  if (!slug) {
    if (!linkedinUrl) return { ok: false, reason: "no_linkedin_url" };
    return { ok: false, reason: "invalid_url" };
  }
  const base = `https://www.linkedin.com/in/${slug}`;
  switch (fetchType) {
    case "profile_public":   return { ok: true, url: base };
    case "profile_activity": return { ok: true, url: `${base}/recent-activity/all/` };
  }
}

/** Router: entity kind × fetch type → URL builder. */
export function buildUrl(
  entityType: "company" | "contact",
  fetchType: LinkedinFetchType,
  linkedinUrl: string | null | undefined,
): UrlBuildResult {
  if (entityType === "company") {
    if (fetchType === "company_page" || fetchType === "company_posts" || fetchType === "company_people") {
      return buildCompanyUrl(linkedinUrl, fetchType);
    }
    return { ok: false, reason: "not_applicable" };
  }
  // contact
  if (fetchType === "profile_public" || fetchType === "profile_activity") {
    return buildProfileUrl(linkedinUrl, fetchType);
  }
  return { ok: false, reason: "not_applicable" };
}
