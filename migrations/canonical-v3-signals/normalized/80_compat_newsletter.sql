-- 80_compat_newsletter.sql
--
-- Compatibility views that present the legacy news-dashboard table shapes on
-- top of the canonical model. These exist so the application can be cut over
-- to Neon without rewriting 94 query sites in the same change: the SQL
-- translator resolves a legacy resource name to one of these views, and the
-- view is responsible for reassembling the denormalized row the app expects.
--
-- These are a MIGRATION AID, not part of the canonical model. They are
-- read-only by construction (no INSTEAD OF triggers) because the dashboard's
-- user-facing surface is read-only; writes go through the job queue.
--
-- Naming: compat_<legacy table name>. Nothing in the canonical schema may
-- depend on a compat view.

create schema if not exists compat;

comment on schema compat is
  'Read-only legacy-shape views used during the news-dashboard cutover. '
  'Not part of the canonical model; safe to drop once the app queries '
  'canonical relations directly.';

-- These views are a migration aid, so they are dropped and recreated rather
-- than replaced: CREATE OR REPLACE VIEW cannot reorder or rename columns, and
-- nothing in the canonical model is permitted to depend on a compat view.
drop view if exists compat.articles;
drop view if exists compat.issues;
drop view if exists compat.newsletters;
drop view if exists compat.publishers;
drop view if exists compat.source_publications;

-- ---------------------------------------------------------------- publishers
-- Legacy: id, name, website, created_at
-- Canonical: content_publication is the domain-level publication registry.
create view compat.publishers as
select
  p.id,
  p.name,
  p.domain          as website,
  p.created_at
from public.content_publication p;

-- --------------------------------------------------------------- newsletters
-- Legacy: id, name, slug, description, category, source_type, publisher_id,
--         created_at
-- Canonical: content_source rows of kind 'newsletter'.
-- `category` and `publisher_id` have no canonical home on the source; they
-- were denormalized display fields and are surfaced from raw where present.
create view compat.newsletters as
select
  s.id,
  s.name,
  s.slug,
  s.description,
  nullif(s.raw -> 'newsletters' ->> 'category', '')           as category,
  nullif(s.raw -> 'newsletters' ->> 'source_type', '')        as source_type,
  nullif(s.raw -> 'newsletters' ->> 'publisher_id', '')::uuid as publisher_id,
  s.created_at
from public.content_source s
where s.kind = 'newsletter_article';

-- ------------------------------------------------------------------- issues
-- Legacy: id, newsletter_id, issue_date, issue_number, subject, archive_url,
--         email_id, raw_excerpt, ingested_at
create view compat.issues as
select
  e.id,
  e.content_source_id                       as newsletter_id,
  e.edition_date                            as issue_date,
  e.edition_number                          as issue_number,
  e.title                                   as subject,
  e.url                                     as archive_url,
  nullif(e.raw -> 'issues' ->> 'email_id', '')    as email_id,
  nullif(e.raw -> 'issues' ->> 'raw_excerpt', '') as raw_excerpt,
  e.created_at                              as ingested_at
from public.content_edition e;

-- ------------------------------------------------------- source_publications
-- Legacy: id, domain, name, kind, created_at
create view compat.source_publications as
select
  p.id,
  p.domain,
  p.name,
  nullif(p.raw -> 'source_publications' ->> 'kind', '')  as kind,
  p.created_at
from public.content_publication p;

-- ----------------------------------------------------------------- articles
-- The wide one. content_newsletter_item has PRIMARY KEY (content_item_id), so
-- an item has AT MOST ONE newsletter placement and the join is strictly 1:1.
-- The legacy table repeats an article_url across newsletters (286 urls, 438
-- extra rows, 145 with different headlines); those stay distinct because the
-- load keys each legacy row to its own content_item, not to its url. So the
-- row count is preserved without the view needing a many-to-one grain.
--
-- Tag arrays are rebuilt from entity_tag rather than stored, so the view
-- reflects retagging immediately. The eight legacy text[] columns were
-- collapsed into tagged entities during the load; each is projected back by
-- filtering on the tag's local_code namespace.
create view compat.articles as
with item_tags as (
  -- Tag-like arrays live in entity_tag. The legacy array a tag belongs to is
  -- recorded as its taxonomy namespace, which is the canonical way a tag is
  -- bucketed -- NOT a prefix parsed out of local_code (local_code is scoped to
  -- a taxonomy_version and means nothing on its own).
  select
    et.entity_id                        as content_item_id,
    tv.namespace_code                   as bucket,
    array_agg(t.label order by t.label)  as labels
  from public.entity_tag et
  join public.tag t            on t.id = et.tag_id
  join public.taxonomy_version tv on tv.id = t.taxonomy_version_id
  where et.entity_table = 'content_item'
    and et.valid_until_at is null
  group by et.entity_id, tv.namespace_code
),
item_companies as (
  -- Companies and people are resolved ENTITIES, not tags.
  select ce.content_item_id, array_agg(c.name order by c.name) as labels
  from public.content_entity ce
  join public.company c on c.id = ce.entity_id
  where ce.entity_table = 'company'
  group by ce.content_item_id
),
item_people as (
  select ce.content_item_id, array_agg(p.full_name order by p.full_name) as labels
  from public.content_entity ce
  join public.person p on p.id = ce.entity_id
  where ce.entity_table = 'person'
  group by ce.content_item_id
)
select
  ni.content_item_id                       as id,
  ni.content_edition_id                    as issue_id,
  e.content_source_id                      as newsletter_id,
  i.content_publication_id                 as source_pub_id,
  i.title                                  as headline,
  i.summary,
  i.url                                    as article_url,
  ni.raw_url,
  ni.section,
  ni.position,
  ni.item_type,
  ni.read_time_minutes,
  i.is_sponsored,
  i.importance_score,
  i.created_at,

  -- enrichment
  en.sentiment,
  en.sentiment_score,
  en.trend_score,
  en.engagement_score,
  en.ai_insight,

  -- reader prefetch
  rc.fetch_state                           as reader_status,
  rc.fetch_method                          as reader_method,
  rc.reader_title,
  rc.reader_byline,
  rc.reader_content,
  rc.fetched_at                            as reader_fetched_at,

  -- the eight legacy arrays, rebuilt from the tag graph
  coalesce(
    (select labels from item_tags g where g.content_item_id = i.id and g.bucket = 'signals_tags'),
    (select array_agg(x #>> '{}' order by ord)
       from jsonb_array_elements(i.raw -> 'entity_arrays' -> 'tags') with ordinality as t(x, ord)),
    '{}'
  ) as tags,
  coalesce(
    (select labels from item_tags g where g.content_item_id = i.id and g.bucket = 'legacy_canonical'),
    (select array_agg(x #>> '{}' order by ord)
       from jsonb_array_elements(i.raw -> 'entity_arrays' -> 'topics') with ordinality as t(x, ord)),
    '{}'
  ) as topics,
  coalesce(
    (select labels from item_tags g where g.content_item_id = i.id and g.bucket = 'legacy_canonical'),
    (select array_agg(x #>> '{}' order by ord)
       from jsonb_array_elements(i.raw -> 'entity_arrays' -> 'categories') with ordinality as t(x, ord)),
    '{}'
  ) as categories,
  coalesce(
    (select labels from item_tags g where g.content_item_id = i.id and g.bucket = 'legacy_canonical'),
    (select array_agg(x #>> '{}' order by ord)
       from jsonb_array_elements(i.raw -> 'entity_arrays' -> 'products') with ordinality as t(x, ord)),
    '{}'
  ) as products,
  coalesce(
    (select labels from item_tags g where g.content_item_id = i.id and g.bucket = 'legacy_canonical'),
    (select array_agg(x #>> '{}' order by ord)
       from jsonb_array_elements(i.raw -> 'entity_arrays' -> 'industries') with ordinality as t(x, ord)),
    '{}'
  ) as industries,
  coalesce(
    (select labels from item_tags g where g.content_item_id = i.id and g.bucket = 'legacy_canonical'),
    (select array_agg(x #>> '{}' order by ord)
       from jsonb_array_elements(i.raw -> 'entity_arrays' -> 'technologies') with ordinality as t(x, ord)),
    '{}'
  ) as technologies,
  coalesce((select labels from item_companies g where g.content_item_id = i.id),
    (select array_agg(x #>> '{}' order by ord)
       from jsonb_array_elements(i.raw -> 'entity_arrays' -> 'companies') with ordinality as t(x, ord)),
    '{}'
  ) as companies,
  coalesce((select labels from item_people g where g.content_item_id = i.id),
    (select array_agg(x #>> '{}' order by ord)
       from jsonb_array_elements(i.raw -> 'entity_arrays' -> 'people') with ordinality as t(x, ord)),
    '{}'
  ) as people,

  nullif(i.raw ->> 'sponsor_name', '')     as sponsor_name
from public.content_newsletter_item ni
join public.content_item i        on i.id  = ni.content_item_id
join public.content_edition e     on e.id  = ni.content_edition_id
left join public.content_enrichment en on en.content_item_id = i.id
left join signals.reader_cache rc      on rc.content_item_id = i.id;

comment on view compat.articles is
  'Legacy articles shape, 1:1 with content_item via its single newsletter '
  'placement. Repeated article_urls in the legacy table remain distinct rows '
  'because each legacy row maps to its own content_item.';
