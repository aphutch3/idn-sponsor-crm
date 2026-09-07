// Unit tests for the Apify client helpers (pure — no network).

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { actorSlug } from "./client";

describe("actorSlug", () => {
  it("converts owner/actor to owner~actor", () => {
    assert.equal(actorSlug("automation-lab/linkedin-company-scraper"), "automation-lab~linkedin-company-scraper");
  });
  it("leaves already-tilde-form untouched", () => {
    assert.equal(actorSlug("harvestapi~linkedin-profile-scraper"), "harvestapi~linkedin-profile-scraper");
  });
});
