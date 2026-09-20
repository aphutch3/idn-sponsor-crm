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
drop view if exists compat._legacy_id;
drop view if exists compat.issues;
drop view if exists compat.newsletters;
drop view if exists compat.newsletter_sources;
drop view if exists compat.publishers;
drop view if exists compat.source_publications;

-- ------------------------------------------------------------- legacy id map
-- The app addresses every row by its legacy integer id (/api/articles/5009,
-- newsletter_id=eq.12, ...). Those ids are preserved in external_ref as
-- '<table>:<id>' under source_system 'news_dashboard'. Exposing the canonical
-- uuid instead would silently break every id-addressed route and foreign key
-- in the dashboard, so the compat views project the legacy id as `id` and
-- translate foreign keys back to legacy ids too.
create or replace view compat._legacy_id as
select
  entity_table,
  entity_id,
  split_part(external_id, ':', 1)          as legacy_table,
  split_part(external_id, ':', 2)::bigint  as legacy_id
from public.external_ref
where source_system = 'news_dashboard';

comment on view compat._legacy_id is
  'Internal: canonical uuid -> legacy news_dashboard integer id. Not a legacy '
  'shape; consumed by the other compat views.';

-- ---------------------------------------------------------------- publishers
-- Legacy: id, name, website, created_at (49 rows)
-- Publishers are NOT content_publication rows -- content_publication is the
-- legacy `source_publications` table (2118 outbound link domains), a different
-- concept entirely. The 49 publishers are newsletter owners, preserved
-- losslessly on content_source.raw.publisher: Phase D found only 1 of 49
-- matched a canonical company by name and several are individual people, so
-- linking them to company would reintroduce the person/company conflation
-- Phase D had just removed. They stay unlinked pending human adjudication.
create view compat.publishers as
select distinct on ((s.raw -> 'publisher' ->> 'id')::bigint)
  (s.raw -> 'publisher' ->> 'id')::bigint              as id,
   s.raw -> 'publisher' ->> 'name'                     as name,
   s.raw -> 'publisher' ->> 'website'                  as website,
  (s.raw -> 'publisher' ->> 'created_at')::timestamptz as created_at
from public.content_source s
where s.raw -> 'publisher' ->> 'id' is not null
order by (s.raw -> 'publisher' ->> 'id')::bigint;

-- --------------------------------------------------------------- newsletters
-- Legacy: id, name, slug, description, category, source_type, publisher_id,
--         created_at (68 rows)
-- A content_source exists for all 74 registry entries, and `kind` cannot tell
-- the 68 true newsletters from the 6 registry-only sources, so select on the
-- raw payload that only a true newsletter carries. publisher_id is a legacy
-- bigint, not a canonical uuid.
create view compat.newsletters as
select
  (s.raw -> 'newsletters' ->> 'id')::bigint                     as id,
  s.name,
  s.slug,
  s.description,
  nullif(s.raw -> 'newsletters' ->> 'category', '')             as category,
  nullif(s.raw -> 'newsletters' ->> 'source_type', '')          as source_type,
  (s.raw -> 'newsletters' ->> 'publisher_id')::bigint           as publisher_id,
  s.created_at
from public.content_source s
where s.raw ? 'newsletters';

-- ---------------------------------------------------------- newsletter_sources
-- Legacy ingestion registry: 74 rows, a superset of the 68 newsletters.
-- Every legacy column is projected, and only legacy columns are: an earlier
-- draft invented sender_email/archive_url/format, which the source system
-- never had, so /api/newsletters failed on the columns it really sends
-- (topic, frequency, is_ingestable, last_ingested_at, ...).
create view compat.newsletter_sources as
select
  (s.raw -> 'newsletter_sources' ->> 'id')::bigint                as id,
   s.raw -> 'newsletter_sources' ->> 'name'                       as name,
   s.raw -> 'newsletter_sources' ->> 'email'                      as email,
   s.raw -> 'newsletter_sources' ->> 'topic'                      as topic,
   s.raw -> 'newsletter_sources' ->> 'notes'                      as notes,
   s.raw -> 'newsletter_sources' ->> 'publisher'                  as publisher,
   s.raw -> 'newsletter_sources' ->> 'fetch_url'                  as fetch_url,
   s.raw -> 'newsletter_sources' ->> 'frequency'                  as frequency,
   s.raw -> 'newsletter_sources' ->> 'description'                as description,
   s.raw -> 'newsletter_sources' ->> 'source_type'                as source_type,
  (s.raw -> 'newsletter_sources' ->> 'is_active')::boolean        as is_active,
  (s.raw -> 'newsletter_sources' ->> 'is_ingestable')::boolean    as is_ingestable,
  (s.raw -> 'newsletter_sources' ->> 'last_ingested_at')::timestamptz as last_ingested_at,
  (s.raw -> 'newsletter_sources' ->> 'created_at')::timestamptz   as created_at
from public.content_source s
where s.raw ? 'newsletter_sources';

comment on view compat.newsletter_sources is
  'Legacy news_dashboard.newsletter_sources shape. is_active is read from raw '
  'rather than content_source.is_active so the view reports what the source '
  'system recorded, not what the canonical load derived from it.';

-- ------------------------------------------------------------------- issues
-- Legacy: id, newsletter_id, issue_date, issue_number, subject, archive_url,
--         email_id, raw_excerpt, ingested_at
create view compat.issues as
select
  (e.raw -> 'issues' ->> 'id')::bigint      as id,
  (e.raw -> 'issues' ->> 'newsletter_id')::bigint as newsletter_id,
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
  (p.raw -> 'source_publications' ->> 'id')::bigint       as id,
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
  li.legacy_id                             as id,
  (e.raw -> 'issues' ->> 'id')::bigint     as issue_id,
  (e.raw -> 'issues' ->> 'newsletter_id')::bigint as newsletter_id,
  (pub.raw -> 'source_publications' ->> 'id')::bigint as source_pub_id,
  i.title                                  as headline,
  i.summary,
  i.url                                    as article_url,
  ni.raw_url,
  -- Legacy `section` is NOT NULL in practice: 0 nulls, 221 empty strings. The
  -- load normalised '' to null, so project it back or every one of those 221
  -- rows reads differently through the view than through PostgREST.
  coalesce(ni.section, '')                 as section,
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
join compat._legacy_id li
  on li.entity_table = 'content_item'
 and li.entity_id    = ni.content_item_id
join public.content_item i        on i.id  = ni.content_item_id
join public.content_edition e     on e.id  = ni.content_edition_id
left join public.content_publication pub on pub.id = i.content_publication_id
left join public.content_enrichment en on en.content_item_id = i.id
left join signals.reader_cache rc      on rc.content_item_id = i.id;

comment on view compat.articles is
  'Legacy articles shape, 1:1 with content_item via its single newsletter '
  'placement. Repeated article_urls in the legacy table remain distinct rows '
  'because each legacy row maps to its own content_item.';

-- ------------------------------------------- v_newsletter_article_stats
-- Per-newsletter article counts. The dashboard treats a failure here as
-- "zero articles" rather than an error, so an absent view degrades SILENTLY
-- into a wrong page -- which is why it is defined here rather than left to
-- the un-migrated tail.
--
-- last_ingest_at / last_ingest_count are derived from the articles themselves
-- (the newest created_at, and how many rows share that ingest minute), because
-- news_dashboard.ingestion_runs is operational telemetry for a pipeline that
-- still writes to the source system and has not been migrated.
drop view if exists compat.v_newsletter_article_stats;
create view compat.v_newsletter_article_stats as
with per_article as (
  select a.newsletter_id, a.created_at
  from compat.articles a
  where a.newsletter_id is not null
),
newest as (
  select newsletter_id, max(created_at) as last_ingest_at
  from per_article group by newsletter_id
)
select
  n.id                                     as newsletter_id,
  n.name                                   as newsletter_name,
  coalesce(c.total_articles, 0)::bigint    as total_articles,
  w.last_ingest_at                         as last_ingest_at,
  coalesce(b.last_ingest_count, 0)::bigint as last_ingest_count
from compat.newsletters n
left join (
  select newsletter_id, count(*) as total_articles
  from per_article group by newsletter_id
) c on c.newsletter_id = n.id
left join newest w on w.newsletter_id = n.id
left join lateral (
  select count(*) as last_ingest_count
  from per_article p
  where p.newsletter_id = n.id
    and date_trunc('minute', p.created_at) = date_trunc('minute', w.last_ingest_at)
) b on true;

comment on view compat.v_newsletter_article_stats is
  'Legacy news_dashboard.v_newsletter_article_stats shape. Powers the article '
  'counts on /api/newsletters, which silently render 0 if this view is absent.';
