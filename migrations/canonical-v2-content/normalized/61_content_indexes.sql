-- IDN Canonical Schema Contract v2 :: content domain access paths
-- Release candidate canonical-v2-content. Execute only through the guarded release runner.
--
-- Every index below exists for a named query the applications and agents actually run.
-- Indexes are deliberately not added for columns with no known access path.

begin;

-- Reverse-chronological feeds, globally and per channel. These are the dominant
-- read patterns for every dashboard surface and every agent asking "what is new".
create index if not exists content_item_published_at_desc_idx
  on public.content_item (published_at desc nulls last);

create index if not exists content_item_source_published_at_idx
  on public.content_item (content_source_id, published_at desc nulls last);

-- Ranked "top stories" within a rolling window.
create index if not exists content_item_importance_idx
  on public.content_item (importance_score desc nulls last)
  where importance_score is not null;

-- Ingestion recency. The 24-hour digest windows select on created_at, not published_at,
-- because they report on what was ingested rather than what was authored.
create index if not exists content_item_created_at_idx
  on public.content_item (created_at desc);

-- Partitioning reads by platform, which is how each channel workspace scopes itself.
create index if not exists content_item_kind_published_at_idx
  on public.content_item (kind, published_at desc nulls last);

-- Sponsored-content reporting is a small slice of a large table.
create index if not exists content_item_sponsored_idx
  on public.content_item (published_at desc nulls last)
  where is_sponsored;

-- Author attribution lookups, sparse until entity resolution populates it.
create index if not exists content_item_author_person_idx
  on public.content_item (author_person_id)
  where author_person_id is not null;

create index if not exists content_item_publication_idx
  on public.content_item (content_publication_id)
  where content_publication_id is not null;

-- Non-unique URL lookup. Syndicated placements repeat a URL, so this cannot be unique.
create index if not exists content_item_url_idx
  on public.content_item (url)
  where url is not null;

-- Trigram search over headlines for the operator-facing search box.
create index if not exists content_item_title_trgm_idx
  on public.content_item using gin (title public.gin_trgm_ops);

-- Edition browsing.
create index if not exists content_edition_source_published_idx
  on public.content_edition (content_source_id, edition_date desc);

create index if not exists content_newsletter_item_edition_position_idx
  on public.content_newsletter_item (content_edition_id, position);

-- Reverse traversal of the relationship table: "everything about this entity".
-- The primary key already serves item-to-entity traversal.
create index if not exists content_entity_entity_idx
  on public.content_entity (entity_table, entity_id, role);

-- Latest observation per item and measure.
create index if not exists content_metric_item_kind_latest_idx
  on public.content_metric (content_item_id, kind, observed_at desc);

-- Channel rosters.
create index if not exists content_source_kind_active_idx
  on public.content_source (kind, is_active);

create index if not exists content_source_normalized_name_idx
  on public.content_source (normalized_name);

create index if not exists content_source_company_idx
  on public.content_source (company_id)
  where company_id is not null;

commit;
