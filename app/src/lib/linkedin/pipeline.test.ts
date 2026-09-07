// Unit tests for LinkedIn URL builders, parsers, and diff engine.
// Runs offline (no Firecrawl/DB). Execute with:
//   npx tsx --test src/lib/linkedin/pipeline.test.ts

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import { normalizeLinkedinUrl, extractCompanySlug, extractProfileSlug, buildUrl } from "./urls";
import { parseFetch } from "./parse";
import { diff, hashParsed } from "./diff";

describe("normalizeLinkedinUrl", () => {
  it("adds https and drops trackers", () => {
    assert.equal(normalizeLinkedinUrl("linkedin.com/company/acme?utm_source=x"), "https://www.linkedin.com/company/acme");
  });
  it("rejects non-LinkedIn hosts", () => {
    assert.equal(normalizeLinkedinUrl("https://twitter.com/acme"), null);
  });
  it("rejects login/authwall URLs", () => {
    assert.equal(normalizeLinkedinUrl("https://www.linkedin.com/authwall?xyz"), null);
    assert.equal(normalizeLinkedinUrl("https://www.linkedin.com/login"), null);
  });
  it("handles null/empty gracefully", () => {
    assert.equal(normalizeLinkedinUrl(null), null);
    assert.equal(normalizeLinkedinUrl(""), null);
    assert.equal(normalizeLinkedinUrl("   "), null);
  });
});

describe("slug extractors", () => {
  it("extracts company slug from various forms", () => {
    assert.equal(extractCompanySlug("https://www.linkedin.com/company/openai/"), "openai");
    assert.equal(extractCompanySlug("https://linkedin.com/company/openai?trk=y"), "openai");
    assert.equal(extractCompanySlug("https://www.linkedin.com/in/johndoe/"), null);
  });
  it("extracts profile slug", () => {
    assert.equal(extractProfileSlug("https://www.linkedin.com/in/john-doe-123/"), "john-doe-123");
  });
});

describe("buildUrl", () => {
  it("builds company_page URL", () => {
    const r = buildUrl("company", "company_page", "https://linkedin.com/company/openai");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.url, "https://www.linkedin.com/company/openai");
  });
  it("builds company_posts URL", () => {
    const r = buildUrl("company", "company_posts", "https://linkedin.com/company/openai");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.url, "https://www.linkedin.com/company/openai/posts/?feedView=all");
  });
  it("builds profile_public URL", () => {
    const r = buildUrl("contact", "profile_public", "https://www.linkedin.com/in/johndoe/");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.url, "https://www.linkedin.com/in/johndoe");
  });
  it("rejects contact with company fetch type", () => {
    const r = buildUrl("contact", "company_page", "https://www.linkedin.com/in/johndoe/");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "not_applicable");
  });
  it("returns no_linkedin_url when missing", () => {
    const r = buildUrl("company", "company_page", null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "no_linkedin_url");
  });
});

describe("parseFetch — company_page", () => {
  const md = `# Acme Corp

Building the future of enterprise AI.

## Overview

Acme is a leading enterprise AI platform serving 500+ Fortune 2000 customers with agent-driven automation. Headquartered in San Francisco with offices worldwide.

## Details

Industry
Software Development

Company size
501-1,000 employees

Headquarters
San Francisco, California

Website
https://acme.example.com

Followers
12,345 followers
`;
  const meta = {
    title: "Acme Corp | LinkedIn",
    description: "Building the future of enterprise AI.",
    "og:description": "Building the future of enterprise AI.",
  };

  it("extracts core company fields", () => {
    const parsed = parseFetch("company_page", md, meta);
    assert.equal(parsed.kind, "company_page");
    if (parsed.kind !== "company_page") return;
    assert.equal(parsed.name, "Acme Corp");
    assert.equal(parsed.tagline, "Building the future of enterprise AI.");
    assert.equal(parsed.industry, "Software Development");
    assert.equal(parsed.headcount_range, "501-1,000 employees");
    assert.equal(parsed.hq_location, "San Francisco, California");
    assert.equal(parsed.website, "https://acme.example.com");
    assert.equal(parsed.followers, "12,345 followers");
    assert.ok((parsed.about ?? "").includes("Fortune 2000"));
  });
});

describe("diff — company_page", () => {
  it("emits no signals for identical snapshots", () => {
    const a = parseFetch("company_page", "# Acme\n\nCompany size\n100-200 employees\n", {});
    assert.deepEqual(diff(a, a), []);
  });
  it("emits headcount_change on size bump", () => {
    const a = parseFetch("company_page", "# Acme\n\nCompany size\n100-200 employees\n", {});
    const b = parseFetch("company_page", "# Acme\n\nCompany size\n501-1,000 employees\n", {});
    const signals = diff(a, b);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]!.signal_kind, "headcount_change");
    assert.equal(signals[0]!.before_value, "100-200 employees");
    assert.equal(signals[0]!.after_value, "501-1,000 employees");
  });
  it("emits website_change", () => {
    const a = parseFetch("company_page", "# Acme\n\nWebsite\nhttps://old.example.com\n", {});
    const b = parseFetch("company_page", "# Acme\n\nWebsite\nhttps://new.example.com\n", {});
    const signals = diff(a, b);
    assert.ok(signals.some((s) => s.signal_kind === "website_change"));
  });
  it("emits nothing when prior is null (baseline)", () => {
    const b = parseFetch("company_page", "# Acme\n\nCompany size\n100-200\n", {});
    assert.deepEqual(diff(null, b), []);
  });
});

describe("hashParsed", () => {
  it("is stable across key insertion order", () => {
    const a = { kind: "company_page" as const, name: "Acme", industry: "SaaS" };
    const b = { kind: "company_page" as const, industry: "SaaS", name: "Acme" };
    assert.equal(hashParsed(a), hashParsed(b));
  });
  it("changes when any field changes", () => {
    const a = { kind: "company_page" as const, name: "Acme" };
    const b = { kind: "company_page" as const, name: "Acme2" };
    assert.notEqual(hashParsed(a), hashParsed(b));
  });
});
