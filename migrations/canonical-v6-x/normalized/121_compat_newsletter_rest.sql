-- 121_compat_newsletter_rest.sql
--
-- The compat relations the newsletter-domain endpoints still resolved to
-- nothing: sponsors, sponsorships, ingestion_runs, the majors pair, and the
-- three reporting views (v_sponsor_activity, v_source_rankings,
-- v_daily_volume). Every one reproduces its legacy shape exactly, including the
-- integer surrogate keys the routes filter and sort on.

begin;

-- create-or-replace cannot change a view column's TYPE, only its definition, so
-- an earlier revision of these views pins the old types in place. Dropped first
-- to make this file re-runnable against a database that already has them.
drop view if exists compat.ingestion_runs;
drop view if exists compat.major_publications;
drop view if exists compat.sponsorships;
drop view if exists compat.sponsors;
drop view if exists compat.v_sponsor_activity;

-- ------------------------------------------------------------------ sponsors
-- Legacy `sponsors` is a projection of public.company: the sponsor was never a
-- separate kind of thing, which is why 65 of the 212 resolved to companies the
-- events and CRM apps already had. external_ref carries the legacy integer id.
-- The legacy id comes from company.raw->'sponsors'->>'id', which is how the
-- whole newsletter domain records lineage (content_edition.raw->'issues',
-- content_item.raw->'articles'). The guard matters: public.company holds every
-- company from every app, and only those that were newsletter sponsors carry
-- this key.
create or replace view compat.sponsor_id as
select c.id as company_id,
       ((c.raw -> 'sponsors') ->> 'id')::bigint as id
  from public.company c
 where c.raw ? 'sponsors'
   and (c.raw -> 'sponsors') ->> 'id' is not null;

create or replace view compat.sponsors as
select si.id,
       c.name,
       c.domain::text as domain,
       -- The legacy sponsor category is an editorial grouping of the placement,
       -- not the company's industry, so it is read back out of the evidence
       -- payload rather than from company.industry, which follows a different
       -- taxonomy and would quietly answer a different question.
       (c.raw -> 'sponsors') ->> 'category' as category,
       c.created_at
  from compat.sponsor_id si
  join public.company c on c.id = si.company_id;

-- -------------------------------------------------------------- sponsorships
create or replace view compat.sponsorship_id as
select s.id as sponsorship_id,
       ((s.raw -> 'sponsorships') ->> 'id')::bigint as id
  from signals.content_sponsorship s
 where s.raw ? 'sponsorships';

create or replace view compat.sponsorships as
select spi.id,
       si.id           as sponsor_id,
       ((e.raw -> 'issues') ->> 'id')::bigint         as issue_id,
       ((e.raw -> 'issues') ->> 'newsletter_id')::bigint
         as newsletter_id,
       ((it.raw -> 'articles') ->> 'id')::bigint      as article_id,
       s.placement,
       s.headline,
       s.cta_url,
       -- Derived, not stored. Legacy kept issue_date on the placement as well
       -- as on the issue, which is the same fact in two rows and free to
       -- disagree; the edition is the single place a date lives.
       e.edition_date  as issue_date,
       s.created_at
  from signals.content_sponsorship s
  join compat.sponsorship_id spi on spi.sponsorship_id = s.id
  join public.content_edition e  on e.id = s.content_edition_id

  left join compat.sponsor_id si  on si.company_id = s.company_id
  left join public.content_item it on it.id = s.content_item_id;

create or replace view compat.v_sponsor_activity as
select c.name,
       c.domain::text as domain,
       (c.raw -> 'sponsors') ->> 'category' as category,
       count(s.id)                        as appearances,
       count(distinct e.content_source_id) as newsletters,
       min(e.edition_date)                as first_seen,
       max(e.edition_date)                as last_seen
  from public.company c
  join signals.content_sponsorship s on s.company_id = c.id
  join public.content_edition e      on e.id = s.content_edition_id
 group by c.id, c.name, c.domain, (c.raw -> 'sponsors') ->> 'category'
 order by count(s.id) desc;

-- ------------------------------------------------------------- source ranking
create or replace view compat.v_source_rankings as
select p.domain::text as domain,
       p.name,
       nullif((p.raw -> 'source_publications') ->> 'kind', '') as kind,
       count(i.id)                         as article_count,
       count(distinct e.content_source_id) as newsletters_citing,
       max(e.edition_date)                 as last_seen
  from public.content_publication p
  join public.content_item i     on i.content_publication_id = p.id
  join public.content_newsletter_item ni on ni.content_item_id = i.id
  join public.content_edition e  on e.id = ni.content_edition_id
 where ni.item_type = 'article'
 group by p.id, p.domain, p.name,
          nullif((p.raw -> 'source_publications') ->> 'kind', '')
 order by count(i.id) desc;

-- --------------------------------------------------------------- daily volume
create or replace view compat.v_daily_volume as
select e.edition_date as issue_date,
       s.name         as newsletter,
       count(i.id)    as articles
  from public.content_edition e
  join public.content_source s on s.id = e.content_source_id
  left join public.content_newsletter_item ni
         on ni.content_edition_id = e.id
  left join public.content_item i
         on i.id = ni.content_item_id and ni.item_type = 'article'
 group by e.edition_date, s.name
 order by e.edition_date desc;

-- ------------------------------------------------------------ ingestion runs
create or replace view compat.ingestion_run_id as
select er.entity_id as job_run_id,
       public.legacy_bigint(er.external_id) as id
  from public.external_ref er
 where er.source_system = 'news_dashboard'
   and er.entity_table = 'signals.job_run'
   and er.external_id like 'ingestion_runs:%';

create or replace view compat.ingestion_runs as
select ri.id,
       -- 'daily' and 'on_demand' are the same job with different triggers, so
       -- the canonical row stores one kind and the trigger as a parameter. The
       -- legacy column is reconstructed from that parameter.
       case r.params ->> 'trigger'
            when 'on_demand' then 'on_demand' else 'daily' end as kind,
       -- Legacy spells a finished run 'success'; the canonical enum says 'done'.
       case r.status when 'done' then 'success'
                     else r.status::text end as status,
       r.started_at,
       r.finished_at,
       -- Computed from the timestamps rather than stored beside them, so the
       -- duration can never contradict the interval it describes.
       -- Rounded to a tenth, matching what the pipeline stored. A run's
       -- duration is a wall-clock measurement of a multi-minute job, so
       -- microsecond precision claims an accuracy the number does not have.
       case when r.finished_at is not null
            then round(extract(epoch from (r.finished_at - r.started_at))::numeric, 1)
       end as duration_seconds,
       max(m.value) filter (where m.metric_code = 'new_articles')::int
         as new_articles,
       max(m.value) filter (where m.metric_code = 'new_issues')::int
         as new_issues,
       max(m.value) filter (where m.metric_code = 'new_sources')::int
         as new_sources,
       max(m.value) filter (where m.metric_code = 'new_sponsors')::int
         as new_sponsors,
       max(m.value) filter (where m.metric_code = 'new_sponsorships')::int
         as new_sponsorships,
       max(m.value) filter (where m.metric_code = 'total_articles')::int
         as total_articles,
       max(m.value) filter (where m.metric_code = 'total_issues')::int
         as total_issues,
       max(m.value) filter (where m.metric_code = 'reader_ok')::int
         as reader_ok,
       max(m.value) filter (where m.metric_code = 'reader_failed')::int
         as reader_failed,
       r.error,
       r.summary,
       r.started_at as created_at
  from signals.job_run r
  join compat.ingestion_run_id ri on ri.job_run_id = r.id
  left join signals.job_run_metric m on m.job_run_id = r.id
 group by ri.id, r.params, r.status, r.started_at, r.finished_at, r.error,
          r.summary;

-- ------------------------------------------------------------------- majors
create or replace view compat.major_id as
select er.entity_id as major_publication_id,
       public.legacy_bigint(er.external_id) as id
  from public.external_ref er
 where er.source_system = 'news_dashboard'
   and er.entity_table = 'signals.major_publication'
   and er.external_id like 'major_publications:%';

create or replace view compat.major_publications as
select mi.id,
       m.slug,
       m.name,
       m.publisher,
       m.tagline,
       m.website_url as website,
       m.view_type,
       -- Re-packed from the junction table into the text[] the routes expect.
       -- Ordered so the array is stable between calls.
       coalesce(
         (select array_agg(nl.id order by nl.id)
            from signals.major_publication_source ms
            join public.content_source cs on cs.id = ms.content_source_id
            cross join lateral (
              select ((cs.raw -> 'newsletters') ->> 'id')::bigint
                       as id) nl
           where ms.major_publication_id = m.id
             and nl.id is not null),
         '{}'::bigint[]
       ) as newsletter_ids,
       m.accent,
       m.notes,
       m.position as sort_order,
       m.is_active,
       m.created_at,
       m.url_pattern,
       m.selector
  from signals.major_publication m
  join compat.major_id mi on mi.major_publication_id = m.id;

create or replace view compat.major_analyses as
select row_number() over (order by mi.id, a.kind) as id,
       mi.id as major_id,
       a.kind,
       a.payload,
       a.model_version as model,
       a.source_count,
       a.generated_at
  from signals.major_analysis a
  join compat.major_id mi on mi.major_publication_id = a.major_publication_id;

commit;
