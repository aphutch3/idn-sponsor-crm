# Canonical Neon — content domain schema for review

Release `canonical-v2-content`. Additive: no existing table, column or row is altered.

Rehearsed and applied on a fresh branch off `main` (`v2-release-rehearsal-2026-09-20`).

`public` base tables after this release: **82** (was 74).


## `public.content_publication`

One external website that hosts linked articles. Grain: one normalized domain. Authority: canonical.

- **Grain:** One normalized hosting domain
- **Domain:** content · **PII class:** none
- **Authority:** canonical

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | `uuid` | no | Surrogate primary key |
| `domain` | `text` | no | Hosting site domain as supplied by the source |
| `normalized_domain` | `text` | no | Lowercased domain without a www prefix; the deduplication key — *derived* |
| `name` | `text` | yes | Human readable publication name — null means: Name not known |
| `company_id` | `uuid` | yes | Canonical public.company that owns this publication — null means: Publication not yet resolved to a company |
| `source_system` | `text` | yes | Originating system code from public.source_system — null means: Provenance not recorded |
| `raw` | `jsonb` | no | Retained source payload for this row |
| `created_at` | `timestamp with time zone` | no | Row creation timestamp in this database |
| `updated_at` | `timestamp with time zone` | no | Last modification timestamp in this database |

**Constraints**

- `content_publication_domain_not_blank` — CHECK ((length(btrim(domain)) > 0))
- `content_publication_company_id_fkey` — FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE SET NULL
- `content_publication_source_system_fkey` — FOREIGN KEY (source_system) REFERENCES source_system(code)
- `content_publication_pkey` — PRIMARY KEY (id)

**Indexes**

- `content_publication_normalized_domain_uk` — `btree (normalized_domain)`

**Triggers**

- `tg_content_publication_normalize` → `normalize_content_publication()`
- `tg_content_publication_updated` → `tg_touch_updated_at()`

## `public.content_source`

One channel that publishes content, such as a newsletter, social account or video channel. Grain: one channel. Authority: canonical.

- **Grain:** One publishing channel
- **Domain:** content · **PII class:** internal
- **Authority:** canonical

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | `uuid` | no | Surrogate primary key |
| `slug` | `text` | no | Stable human readable identifier for the channel |
| `kind` | `content_kind` | no | Platform form of the content this channel publishes |
| `name` | `text` | no | Display name of the channel |
| `normalized_name` | `text` | no | Case and punctuation folded name; the deduplication key — *derived* |
| `company_id` | `uuid` | yes | Canonical public.company that owns this channel — null means: Channel is not owned by a company, or is not yet resolved |
| `person_id` | `uuid` | yes | Canonical public.person who owns this channel when it is an individual creator — null means: Channel is not an individual creator, or is not yet resolved |
| `homepage_url` | `text` | yes | Public landing page for the channel — null means: Not known |
| `feed_url` | `text` | yes | Machine readable feed or archive endpoint — null means: No feed known |
| `external_handle` | `text` | yes | Platform handle or channel identifier on the originating platform — null means: Not applicable to this platform |
| `is_active` | `boolean` | no | Whether the channel is currently ingested |
| `description` | `text` | yes | Editorial description of the channel — null means: Not described |
| `source_system` | `text` | yes | Originating system code from public.source_system — null means: Provenance not recorded |
| `raw` | `jsonb` | no | Retained source payload for this row |
| `created_at` | `timestamp with time zone` | no | Row creation timestamp in this database |
| `updated_at` | `timestamp with time zone` | no | Last modification timestamp in this database |

**Constraints**

- `content_source_single_owner_check` — CHECK (((company_id IS NULL) OR (person_id IS NULL)))
- `content_source_slug_not_blank` — CHECK ((length(btrim(slug)) > 0))
- `content_source_company_id_fkey` — FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE SET NULL
- `content_source_person_id_fkey` — FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE SET NULL
- `content_source_source_system_fkey` — FOREIGN KEY (source_system) REFERENCES source_system(code)
- `content_source_pkey` — PRIMARY KEY (id)

**Indexes**

- `content_source_company_idx` — `btree (company_id) WHERE (company_id IS NOT NULL)`
- `content_source_kind_active_idx` — `btree (kind, is_active)`
- `content_source_normalized_name_idx` — `btree (normalized_name)`
- `content_source_slug_uk` — `btree (slug)`

**Triggers**

- `tg_content_source_normalize` → `normalize_content_source()`
- `tg_content_source_updated` → `tg_touch_updated_at()`

## `public.content_edition`

One dated issue of a periodical content source. Grain: one issue. Authority: canonical.

- **Grain:** One issue of a source
- **Domain:** content · **PII class:** internal
- **Authority:** canonical

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | `uuid` | no | Surrogate primary key |
| `content_source_id` | `uuid` | no | Publishing channel this issue belongs to |
| `edition_date` | `date` | no | Calendar date the issue was published |
| `edition_number` | `integer` | yes | Publisher assigned sequential issue number — null means: Publisher does not number issues |
| `title` | `text` | yes | Issue title — null means: Untitled issue |
| `url` | `text` | yes | Public archive URL for the issue — null means: No archive page known |
| `published_at` | `timestamp with time zone` | yes | Publication instant when a precise time is known — null means: Only the calendar date is known |
| `source_system` | `text` | yes | Originating system code from public.source_system — null means: Provenance not recorded |
| `raw` | `jsonb` | no | Retained source payload for this row |
| `created_at` | `timestamp with time zone` | no | Row creation timestamp in this database |
| `updated_at` | `timestamp with time zone` | no | Last modification timestamp in this database |

**Constraints**

- `content_edition_number_positive` — CHECK (((edition_number IS NULL) OR (edition_number > 0)))
- `content_edition_content_source_id_fkey` — FOREIGN KEY (content_source_id) REFERENCES content_source(id) ON DELETE CASCADE
- `content_edition_source_system_fkey` — FOREIGN KEY (source_system) REFERENCES source_system(code)
- `content_edition_pkey` — PRIMARY KEY (id)

**Indexes**

- `content_edition_source_date_uk` — `btree (content_source_id, edition_date)`
- `content_edition_source_published_idx` — `btree (content_source_id, edition_date DESC)`

**Triggers**

- `tg_content_edition_updated` → `tg_touch_updated_at()`

## `public.content_item`

One addressable piece of published content, independent of platform. Related entities are rows in content_entity and are never stored as text arrays. Grain: one content item. Authority: canonical.

- **Grain:** One content item
- **Domain:** content · **PII class:** internal
- **Authority:** canonical

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | `uuid` | no | Surrogate primary key |
| `kind` | `content_kind` | no | Platform form of this content item |
| `content_source_id` | `uuid` | yes | Channel that published this item — null means: Item has no identified publishing channel |
| `content_publication_id` | `uuid` | yes | External site hosting the linked article — null means: Item is not a link to an external site |
| `title` | `text` | yes | Headline as presented by the publishing channel — null means: Untitled |
| `summary` | `text` | yes | Short summary as supplied by the source — null means: No summary supplied |
| `body_text` | `text` | yes | Full text of the item when the channel itself publishes it — null means: Body not published by this channel; fetched bodies live in signals.reader_cache |
| `url` | `text` | yes | Destination URL for the item — null means: No URL supplied |
| `canonical_url` | `text` | yes | Deduplicating URL; null where a URL legitimately repeats across placements — null means: Item is a distinct placement and must not be deduplicated by URL |
| `author_person_id` | `uuid` | yes | Canonical public.person credited as author — null means: Author not identified or not yet resolved |
| `published_at` | `timestamp with time zone` | yes | Instant the item was published by the source — null means: Publication time not supplied |
| `language` | `text` | yes | BCP 47 language code of the item — null means: Language not determined |
| `importance_score` | `numeric(6,3)` | yes | Editorial importance ranking on a 0 to 100 scale — *derived*; unit: score 0-100; null means: Not scored |
| `is_sponsored` | `boolean` | no | Whether the item is paid placement |
| `source_system` | `text` | yes | Originating system code from public.source_system — null means: Provenance not recorded |
| `raw` | `jsonb` | no | Retained source payload for this row |
| `created_at` | `timestamp with time zone` | no | Row creation timestamp in this database |
| `updated_at` | `timestamp with time zone` | no | Last modification timestamp in this database |

**Constraints**

- `content_item_importance_range` — CHECK (((importance_score IS NULL) OR ((importance_score >= (0)::numeric) AND (importance_score <= (100)::numeric))))
- `content_item_author_person_id_fkey` — FOREIGN KEY (author_person_id) REFERENCES person(id) ON DELETE SET NULL
- `content_item_content_publication_id_fkey` — FOREIGN KEY (content_publication_id) REFERENCES content_publication(id) ON DELETE SET NULL
- `content_item_content_source_id_fkey` — FOREIGN KEY (content_source_id) REFERENCES content_source(id) ON DELETE SET NULL
- `content_item_source_system_fkey` — FOREIGN KEY (source_system) REFERENCES source_system(code)
- `content_item_pkey` — PRIMARY KEY (id)

**Indexes**

- `content_item_author_person_idx` — `btree (author_person_id) WHERE (author_person_id IS NOT NULL)`
- `content_item_canonical_url_uk` — `btree (canonical_url) WHERE (canonical_url IS NOT NULL)`
- `content_item_created_at_idx` — `btree (created_at DESC)`
- `content_item_importance_idx` — `btree (importance_score DESC NULLS LAST) WHERE (importance_score IS NOT NULL)`
- `content_item_kind_published_at_idx` — `btree (kind, published_at DESC NULLS LAST)`
- `content_item_publication_idx` — `btree (content_publication_id) WHERE (content_publication_id IS NOT NULL)`
- `content_item_published_at_desc_idx` — `btree (published_at DESC NULLS LAST)`
- `content_item_source_published_at_idx` — `btree (content_source_id, published_at DESC NULLS LAST)`
- `content_item_sponsored_idx` — `btree (published_at DESC NULLS LAST) WHERE is_sponsored`
- `content_item_title_trgm_idx` — `gin (title gin_trgm_ops)`
- `content_item_url_idx` — `btree (url) WHERE (url IS NOT NULL)`

**Triggers**

- `tg_content_item_updated` → `tg_touch_updated_at()`

## `public.content_newsletter_item`

Newsletter-specific placement detail for a content item. Grain: one item placement within an edition. Authority: canonical.

- **Grain:** One item placement within an edition
- **Domain:** content · **PII class:** internal
- **Authority:** canonical

| Column | Type | Null | Meaning |
|---|---|---|---|
| `content_item_id` | `uuid` | no | Content item this placement describes |
| `content_edition_id` | `uuid` | no | Issue in which the item appeared |
| `section` | `text` | yes | Named section of the issue containing the item — null means: Issue is not sectioned |
| `position` | `integer` | yes | Zero based ordinal of the item within the issue — unit: ordinal; null means: Ordering not supplied |
| `item_type` | `text` | yes | Publisher classification of the placement, such as article or sponsor — null means: Not classified |
| `read_time_minutes` | `integer` | yes | Publisher stated reading time — unit: minutes; null means: Not stated |
| `raw_url` | `text` | yes | Tracking or redirect URL exactly as published — null means: No tracking URL supplied |

**Constraints**

- `content_newsletter_item_position_positive` — CHECK ((("position" IS NULL) OR ("position" >= 0)))
- `content_newsletter_item_read_time_positive` — CHECK (((read_time_minutes IS NULL) OR (read_time_minutes >= 0)))
- `content_newsletter_item_content_edition_id_fkey` — FOREIGN KEY (content_edition_id) REFERENCES content_edition(id) ON DELETE CASCADE
- `content_newsletter_item_content_item_id_fkey` — FOREIGN KEY (content_item_id) REFERENCES content_item(id) ON DELETE CASCADE
- `content_newsletter_item_pkey` — PRIMARY KEY (content_item_id)

**Indexes**

- `content_newsletter_item_edition_position_idx` — `btree (content_edition_id, "position")`

## `public.content_entity`

Governed relationship from a content item to a canonical entity, with role, provenance and confidence. Grain: one item-entity-role relationship. Authority: canonical.

- **Grain:** One item-entity-role relationship
- **Domain:** content · **PII class:** personal
- **Authority:** canonical

| Column | Type | Null | Meaning |
|---|---|---|---|
| `content_item_id` | `uuid` | no | Content item the relationship originates from |
| `entity_table` | `text` | no | Approved canonical target kind for the relationship |
| `entity_id` | `uuid` | no | Identifier of the target row within the approved target kind |
| `role` | `text` | no | Nature of the relationship, such as author, mentioned or sponsor |
| `confidence` | `numeric(6,5)` | yes | Extraction confidence where the relationship was inferred — *derived*; unit: probability 0-1; null means: Relationship was asserted rather than inferred |
| `source_system` | `text` | yes | System that asserted the relationship — null means: Provenance not recorded |
| `evidence` | `jsonb` | no | Supporting evidence for the relationship |
| `created_at` | `timestamp with time zone` | no | Row creation timestamp in this database |

**Constraints**

- `content_entity_confidence_check` — CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))))
- `content_entity_entity_table_check` — CHECK ((entity_table = ANY (ARRAY['person'::text, 'company'::text, 'tag'::text, 'event'::text, 'session'::text, 'content_item'::text])))
- `content_entity_role_check` — CHECK ((role = ANY (ARRAY['mentioned'::text, 'author'::text, 'subject'::text, 'sponsor'::text, 'speaker'::text, 'employer'::text, 'cited'::text, 'quoted'::text, 'publisher'::text])))
- `content_entity_content_item_id_fkey` — FOREIGN KEY (content_item_id) REFERENCES content_item(id) ON DELETE CASCADE
- `content_entity_source_system_fkey` — FOREIGN KEY (source_system) REFERENCES source_system(code)
- `content_entity_pkey` — PRIMARY KEY (content_item_id, entity_table, entity_id, role)

**Indexes**

- `content_entity_entity_idx` — `btree (entity_table, entity_id, role)`

**Triggers**

- `tg_content_entity_validate_target` → `validate_content_entity_target()`

## `public.content_metric`

Append-only observation of a content metric at a point in time. Never overwrite a row here; insert a new observation. Grain: one observation. Authority: source evidence.

- **Grain:** One metric observation
- **Domain:** content · **PII class:** none
- **Authority:** source evidence

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | `uuid` | no | Surrogate primary key |
| `content_item_id` | `uuid` | no | Content item the observation describes |
| `kind` | `content_metric_kind` | no | Measure being observed |
| `value` | `bigint` | no | Observed value of the measure — unit: count |
| `observed_at` | `timestamp with time zone` | no | Instant the measure was read from the source platform |
| `source_system` | `text` | yes | System the observation was read from — null means: Provenance not recorded |

**Constraints**

- `content_metric_value_nonnegative` — CHECK ((value >= 0))
- `content_metric_content_item_id_fkey` — FOREIGN KEY (content_item_id) REFERENCES content_item(id) ON DELETE CASCADE
- `content_metric_source_system_fkey` — FOREIGN KEY (source_system) REFERENCES source_system(code)
- `content_metric_pkey` — PRIMARY KEY (id)

**Indexes**

- `content_metric_item_kind_latest_idx` — `btree (content_item_id, kind, observed_at DESC)`
- `content_metric_item_kind_observed_uk` — `btree (content_item_id, kind, observed_at)`

**Triggers**

- `tg_content_metric_append_only` → `reject_content_metric_mutation()`

## `public.content_enrichment`

Model-derived scoring for a content item, retained with the model that produced it. Grain: one content item. Authority: derived.

- **Grain:** One content item
- **Domain:** content · **PII class:** internal
- **Authority:** derived model output

| Column | Type | Null | Meaning |
|---|---|---|---|
| `content_item_id` | `uuid` | no | Content item that was scored |
| `sentiment` | `text` | yes | Categorical sentiment label — *derived*; null means: Not scored |
| `sentiment_score` | `numeric(6,5)` | yes | Signed sentiment magnitude — *derived*; unit: score -1 to 1; null means: Not scored |
| `trend_score` | `numeric(6,3)` | yes | Model estimate of topical momentum — *derived*; unit: score; null means: Not scored |
| `engagement_score` | `numeric(6,3)` | yes | Model estimate of expected engagement — *derived*; unit: score; null means: Not scored |
| `ai_insight` | `text` | yes | Model authored analytical note — *derived*; null means: No note produced |
| `model` | `text` | yes | Identifier of the model that produced this scoring — null means: Producing model not recorded |
| `scored_at` | `timestamp with time zone` | yes | Instant the scoring was produced — null means: Not scored |
| `raw` | `jsonb` | no | Retained model response payload |

**Constraints**

- `content_enrichment_sentiment_check` — CHECK (((sentiment IS NULL) OR (sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text, 'mixed'::text]))))
- `content_enrichment_sentiment_score_range` — CHECK (((sentiment_score IS NULL) OR ((sentiment_score >= ('-1'::integer)::numeric) AND (sentiment_score <= (1)::numeric))))
- `content_enrichment_content_item_id_fkey` — FOREIGN KEY (content_item_id) REFERENCES content_item(id) ON DELETE CASCADE
- `content_enrichment_pkey` — PRIMARY KEY (content_item_id)

## `signals.person_profile`

A tracked Signals individual. The existence of this row is the membership statement. Grain: one canonical person. Authority: app-owned.

- **Grain:** One canonical person
- **Domain:** signals · **PII class:** personal
- **Authority:** app-owned

| Column | Type | Null | Meaning |
|---|---|---|---|
| `person_id` | `uuid` | no | Canonical public.person tracked by Signals |
| `tracked_since` | `timestamp with time zone` | no | Instant this person entered Signals tracking |
| `is_active` | `boolean` | no | Whether the person is currently tracked |
| `archetype` | `text` | yes | Signals editorial archetype assignment — null means: Not yet classified |
| `influence_score` | `numeric(6,3)` | yes | Signals influence ranking on a 0 to 100 scale — *derived*; unit: score 0-100; null means: Not scored |
| `notes` | `text` | yes | Operator authored note — null means: No note |
| `raw` | `jsonb` | no | Retained application payload |
| `created_at` | `timestamp with time zone` | no | Row creation timestamp in this database |
| `updated_at` | `timestamp with time zone` | no | Last modification timestamp in this database |

**Constraints**

- `signals_person_profile_archetype_check` — CHECK (((archetype IS NULL) OR (archetype = ANY (ARRAY['strategist'::text, 'architect'::text, 'engineer'::text]))))
- `signals_person_profile_influence_range` — CHECK (((influence_score IS NULL) OR ((influence_score >= (0)::numeric) AND (influence_score <= (100)::numeric))))
- `person_profile_person_id_fkey` — FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE
- `person_profile_pkey` — PRIMARY KEY (person_id)

**Indexes**

- `signals_person_profile_active_idx` — `btree (is_active, influence_score DESC NULLS LAST)`

**Triggers**

- `tg_signals_person_profile_updated` → `tg_touch_updated_at()`

## `signals.reader_cache`

Operational cache of a third-party article body fetched by the Signals reader pipeline, including retained failures. Grain: one content item. Authority: app-owned.

- **Grain:** One content item
- **Domain:** signals · **PII class:** internal
- **Authority:** app-owned

| Column | Type | Null | Meaning |
|---|---|---|---|
| `content_item_id` | `uuid` | no | Content item whose body was fetched |
| `fetch_state` | `text` | no | Outcome of the most recent prefetch attempt |
| `fetch_method` | `text` | yes | Extraction strategy that produced the body — null means: No attempt has succeeded |
| `reader_title` | `text` | yes | Title found on the fetched page, retained separately because it frequently disagrees with the published headline — null means: No body fetched |
| `reader_byline` | `text` | yes | Byline found on the fetched page — null means: No byline found |
| `reader_content` | `text` | yes | Extracted article body text — null means: No body fetched |
| `word_count` | `integer` | yes | Length of the extracted body — *derived*; unit: words; null means: No body fetched |
| `fetched_at` | `timestamp with time zone` | yes | Instant the body was successfully fetched — null means: Never fetched |
| `attempt_count` | `integer` | no | Number of prefetch attempts made — unit: attempts |
| `error` | `text` | yes | Failure reason retained so a failed fetch is not silently retried as new work — null means: No failure recorded |
| `raw` | `jsonb` | no | Retained fetcher response metadata |
| `created_at` | `timestamp with time zone` | no | Row creation timestamp in this database |
| `updated_at` | `timestamp with time zone` | no | Last modification timestamp in this database |

**Constraints**

- `signals_reader_cache_attempt_count_nonnegative` — CHECK ((attempt_count >= 0))
- `signals_reader_cache_failed_requires_error` — CHECK (((fetch_state <> 'failed'::text) OR (error IS NOT NULL)))
- `signals_reader_cache_fetch_method_check` — CHECK (((fetch_method IS NULL) OR (fetch_method = ANY (ARRAY['native'::text, 'firecrawl'::text, 'other'::text]))))
- `signals_reader_cache_fetch_state_check` — CHECK ((fetch_state = ANY (ARRAY['pending'::text, 'ok'::text, 'failed'::text, 'skipped'::text])))
- `signals_reader_cache_ok_requires_content` — CHECK (((fetch_state <> 'ok'::text) OR ((reader_content IS NOT NULL) AND (fetched_at IS NOT NULL))))
- `signals_reader_cache_word_count_nonnegative` — CHECK (((word_count IS NULL) OR (word_count >= 0)))
- `reader_cache_content_item_id_fkey` — FOREIGN KEY (content_item_id) REFERENCES content_item(id) ON DELETE CASCADE
- `reader_cache_pkey` — PRIMARY KEY (content_item_id)

**Indexes**

- `signals_reader_cache_retry_idx` — `btree (attempt_count, fetched_at NULLS FIRST) WHERE (fetch_state = ANY (ARRAY['pending'::text, 'failed'::text]))`
- `signals_reader_cache_state_idx` — `btree (fetch_state)`

**Triggers**

- `tg_signals_reader_cache_updated` → `tg_touch_updated_at()`


## Enumerated vocabularies

- **`content_kind`** (11): `newsletter_article`, `x_post`, `youtube_video`, `linkedin_post`, `github_repo`, `github_issue`, `podcast_episode`, `voices_story`, `session_abstract`, `external_article`, `other`
- **`content_metric_kind`** (21): `view`, `like`, `reply`, `repost`, `quote`, `bookmark`, `comment`, `share`, `click`, `open`, `star`, `fork`, `watcher`, `subscriber`, `follower`, `open_issue`, `open_pr`, `contributor`, `release`, `engagement_score`, `reach_score`

## Application access contract (`meta.app_contract`, app `idn_signals`)

| Schema | Object | Access | Audited |
|---|---|---|---|
| `public` | `company` | **propose** | yes |
| `public` | `content_edition` | **write** | yes |
| `public` | `content_enrichment` | **write** | yes |
| `public` | `content_entity` | **write** | yes |
| `public` | `content_item` | **write** | yes |
| `public` | `content_metric` | **write** | yes |
| `public` | `content_newsletter_item` | **write** | yes |
| `public` | `content_publication` | **write** | yes |
| `public` | `content_source` | **write** | yes |
| `public` | `entity_tag` | **propose** | yes |
| `public` | `external_ref` | **write** | yes |
| `public` | `person` | **propose** | yes |
| `public` | `tag` | **read** | yes |
| `signals` | `person_profile` | **write** | yes |
| `signals` | `reader_cache` | **write** | yes |

Signals holds `read` on the curated `tag` vocabulary and `propose` on `entity_tag`; it cannot write canonical identity or taxonomy.

