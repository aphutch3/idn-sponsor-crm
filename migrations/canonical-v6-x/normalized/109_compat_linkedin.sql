-- 109_compat_linkedin.sql
--
-- The 10 legacy LinkedIn resources the dashboard reads, rebuilt on canonical
-- tables. Written against pg_get_viewdef() output from the live Supabase
-- database -- the definitions themselves, not a reconstruction from sample
-- rows.
--
-- LEGACY INTEGER IDS. Routes filter on them (profile_id=eq.N, order=id.desc),
-- so they are recovered from public.external_ref, which is where the load
-- recorded the legacy identity of every row. They are not stored a second
-- time on the canonical tables: two copies of an identity is how they drift.
--
-- ROSTER MEMBERSHIP. Legacy answered "is this author on the roster" with an
-- EXISTS against linkedin_profile.slug. Canonically the roster IS the set of
-- accounts carrying a linkedin_account_detail row, so it becomes a join.

begin;

create schema if not exists compat;

-- Legacy id lookups, one per entity kind. Written as views so a re-load that
-- adds rows is reflected immediately.
create or replace view compat.li_profile_id as
select er.entity_id as account_id,
       split_part(er.external_id, ':', 2)::bigint as id
  from public.external_ref er
 where er.entity_table = 'platform_account'
   and er.source_system = 'news_dashboard'
   and er.external_id like 'linkedin_profile:%';

create or replace view compat.li_post_id as
select er.entity_id as content_item_id,
       split_part(er.external_id, ':', 2)::bigint as id
  from public.external_ref er
 where er.entity_table = 'content_item'
   and er.source_system = 'news_dashboard'
   and er.external_id like 'linkedin_post:%';

create or replace view compat.li_engagement_id as
select er.entity_id as observation_id,
       split_part(er.external_id, ':', 2)::bigint as id
  from public.external_ref er
 where er.entity_table = 'linkedin_engagement_observation'
   and er.source_system = 'news_dashboard'
   and er.external_id like 'linkedin_engagement:%';

create or replace view compat.li_run_id as
select er.entity_id as job_run_id,
       split_part(er.external_id, ':', 2)::bigint as id
  from public.external_ref er
 where er.entity_table = 'job_run'
   and er.source_system = 'news_dashboard'
   and er.external_id like 'linkedin_sweep_run:%';

-- ------------------------------------------------------------ base tables

-- The roster row without the two derived counters. v_li_profiles and
-- v_li_bands read THIS, so they never pay for counters they discard: computing
-- them for every row cost 2.5s on 452 profiles.
create or replace view compat.li_profile_base as
select pi.id,
       pa.id            as account_id,
       pa.url           as linkedin_url,
       d.slug,
       d.url_type,
       pa.display_name,
       d.headline,
       d.x_handle,
       d.band,
       d.is_pinned         as pinned,
       d.is_probation      as probation,
       d.score,
       d.cooldown_until,
       d.is_self_confirmed as self_confirmed,
       pa.first_seen_at as first_seen,
       d.last_swept_at  as last_swept,
       d.last_authored_at,
       d.source,
       d.notes
  from signals.linkedin_account_detail d
  join signals.platform_account pa on pa.id = d.platform_account_id
  join compat.li_profile_id pi on pi.account_id = pa.id;

create or replace view compat.linkedin_profile as
select b.id,
       b.linkedin_url,
       b.slug,
       b.url_type,
       b.display_name,
       b.headline,
       b.x_handle,
       b.band,
       b.pinned,
       b.probation,
       b.score,
       b.cooldown_until,
       b.self_confirmed,
       -- authored_30d and activity_30d were stored counters that no route and
       -- no view ever read; both are recomputed from the posts and engagements
       -- themselves. Derived here keeps the legacy column shape without
       -- reintroducing a counter that can go stale.
       (select count(*)::integer from signals.content_linkedin_post p
          join public.content_item ci on ci.id = p.content_item_id
         where p.author_account_id = b.account_id
           and ci.published_at > now() - interval '30 days') as authored_30d,
       (select count(*)::integer from signals.linkedin_engagement_observation e
         where e.platform_account_id = b.account_id
           and e.observed_at > now() - interval '30 days')    as activity_30d,
       b.first_seen,
       b.last_swept,
       b.last_authored_at,
       b.source,
       b.notes
  from compat.li_profile_base b;

create or replace view compat.li_post_metric as
select cm.content_item_id,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'like'))[1]::integer    as reactions,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'comment'))[1]::integer as comments,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'repost'))[1]::integer  as reposts
  from public.content_metric cm
  join signals.content_linkedin_post p on p.content_item_id = cm.content_item_id
 where cm.kind in ('like', 'comment', 'repost')
 group by cm.content_item_id;

-- The post with its author as the CANONICAL account id. Joins between compat
-- views go through this, never through the legacy integer: that id is
-- split_part(external_id, ':', 2)::bigint, an expression no index can serve,
-- so joining on it forced a nested loop that discarded 830,742 rows to return
-- 1,842. The legacy id is for DISPLAY and for the filters the routes send;
-- the uuid is for joining.
create or replace view compat.li_post_base as
select xi.id,
       p.content_item_id,
       p.author_account_id,
       p.post_urn,
       ci.published_at  as posted_at,
       ci.body_text     as text,
       p.is_repost,
       p.is_quote,
       m.reactions,
       m.comments,
       m.reposts,
       ci.url,
       ci.raw,
       p.ingested_at
  from signals.content_linkedin_post p
  join public.content_item ci on ci.id = p.content_item_id
  join compat.li_post_id xi on xi.content_item_id = ci.id
  left join compat.li_post_metric m on m.content_item_id = ci.id;

create or replace view compat.linkedin_post as
select b.id,
       pi.id     as profile_id,
       b.post_urn,
       b.posted_at,
       b.text,
       d.slug    as author_slug,
       b.is_repost,
       b.is_quote,
       b.reactions,
       b.comments,
       b.reposts,
       b.url,
       b.raw,
       b.ingested_at
  from compat.li_post_base b
  left join signals.linkedin_account_detail d
         on d.platform_account_id = b.author_account_id
  left join compat.li_profile_id pi on pi.account_id = b.author_account_id;

create or replace view compat.linkedin_engagement as
select ei.id,
       pi.id as profile_id,
       e.post_urn,
       -- The author is a real account now, so the SLUG resolves through it
       -- rather than being repeated on every edge. The name and URL are what
       -- the sweep observed: those can disagree with the account and be the
       -- better value (the a16z company page is named after a person in the
       -- roster), and the URL's tracking parameter belongs to the sighting,
       -- not to the account. The account is the fallback.
       coalesce(ad.slug, apa.normalized_handle)            as author_slug,
       coalesce(e.observed_author_name, apa.display_name)  as author_name,
       coalesce(e.observed_author_url, apa.url)            as author_url,
       e.posted_at,
       e.observed_at
  from signals.linkedin_engagement_observation e
  join compat.li_engagement_id ei on ei.observation_id = e.id
  left join compat.li_profile_id pi on pi.account_id = e.platform_account_id
  left join signals.platform_account apa on apa.id = e.author_account_id
  left join signals.linkedin_account_detail ad on ad.platform_account_id = apa.id;

create or replace view compat.linkedin_sweep_run as
select ri.id,
       jr.params ->> 'band' as band,
       jr.params ->> 'kind' as kind,
       jr.started_at,
       -- The stored finished_at is clamped so it can never precede the start.
       -- Two legacy rows recorded an inverted pair; the original is kept in
       -- params.clock_anomaly and handed back here so the app sees exactly
       -- what it saw before, while the canonical column stays sane.
       coalesce((jr.params -> 'clock_anomaly' ->> 'finished_at')::timestamptz,
                jr.finished_at) as finished_at,
       jr.params ->> 'apify_run_id'                      as apify_run_id,
       (jr.params ->> 'profiles_queried')::integer       as profiles_queried,
       (jr.summary ->> 'items_returned')::integer        as items_returned,
       (jr.summary ->> 'authored_kept')::integer         as authored_kept,
       (jr.summary ->> 'engagement_kept')::integer       as engagement_kept,
       (jr.summary ->> 'no_result_count')::integer       as no_result_count,
       jr.est_cost_usd                                   as charged_usd,
       jr.params ->> 'vendor_status'                     as status,
       jr.error
  from signals.job_run jr
  join compat.li_run_id ri on ri.job_run_id = jr.id
 where jr.kind = 'linkedin_sweep';

-- linkedin_band_change has never held a row. The table is not recreated: an
-- empty legacy table is not evidence of a fact worth modelling, and the
-- allowlist entry only needs the resource to resolve.
create or replace view compat.linkedin_band_change as
select null::bigint      as id,
       null::bigint      as profile_id,
       null::text        as from_band,
       null::text        as to_band,
       null::text        as reason,
       null::numeric     as score,
       null::timestamptz as changed_at
 where false;

-- ------------------------------------------------------------------- views

create or replace view compat.v_li_profiles as
select p.id,
       p.linkedin_url,
       p.slug,
       p.url_type,
       p.display_name,
       p.headline,
       p.x_handle,
       p.band,
       p.pinned,
       p.probation,
       p.score,
       p.self_confirmed,
       p.source,
       p.notes,
       p.first_seen,
       p.last_swept,
       p.last_authored_at,
       coalesce(s.posts_total, 0)::integer as posts_total,
       coalesce(s.posts_30d, 0)::integer   as posts_30d,
       coalesce(s.posts_7d, 0)::integer    as posts_7d,
       coalesce(s.reposts, 0)::integer     as reposts,
       coalesce(s.reactions, 0)::integer   as reactions,
       coalesce(s.comments, 0)::integer    as comments,
       coalesce(s.reactions, 0)::integer + coalesce(s.comments, 0)::integer
         as engagement_total,
       case when coalesce(s.posts_total, 0) > 0
            then round((coalesce(s.reactions, 0) + coalesce(s.comments, 0))::numeric
                       / s.posts_total::numeric, 1)
            else null::numeric end as avg_engagement,
       s.newest_post,
       s.oldest_post,
       extract(day from now() - s.newest_post)::integer as days_since_post,
       coalesce(e.edges, 0)::integer as engagement_edges
  from compat.li_profile_base p
  left join (
        select author_account_id,
               count(*)                                            as posts_total,
               count(*) filter (where posted_at > now() - interval '30 days') as posts_30d,
               count(*) filter (where posted_at > now() - interval '7 days')  as posts_7d,
               count(*) filter (where is_repost)                    as reposts,
               sum(reactions)                                       as reactions,
               sum(comments)                                        as comments,
               max(posted_at)                                       as newest_post,
               min(posted_at)                                       as oldest_post
          from compat.li_post_base
         group by author_account_id) s on s.author_account_id = p.account_id
  left join (
        select platform_account_id, count(*) as edges
          from signals.linkedin_engagement_observation
         group by platform_account_id) e on e.platform_account_id = p.account_id;

create or replace view compat.v_li_posts as
select pp.id,
       pp.post_urn,
       p.id as profile_id,
       pp.posted_at,
       pp.text,
       pp.is_repost,
       pp.is_quote,
       pp.reactions,
       pp.comments,
       pp.reposts,
       pp.url,
       pp.ingested_at,
       coalesce(pp.reactions, 0) + coalesce(pp.comments, 0)
         + coalesce(pp.reposts, 0) as engagement,
       p.slug,
       p.display_name,
       p.band,
       p.url_type,
       p.linkedin_url,
       p.headline
  from compat.li_post_base pp
  join compat.li_profile_base p on p.account_id = pp.author_account_id;

create or replace view compat.v_li_bands as
select p.band,
       count(*)::integer                                          as profiles,
       count(*) filter (where p.self_confirmed)::integer           as confirmed,
       count(*) filter (where p.url_type = 'company')::integer     as companies,
       count(*) filter (where p.pinned)::integer                   as pinned,
       coalesce(sum(v.posts_30d), 0)::integer                      as posts_30d,
       coalesce(sum(v.posts_total), 0)::integer                    as posts_total,
       round(avg(v.posts_30d), 1)                                  as avg_posts_30d,
       max(v.posts_30d)                                            as max_posts_30d,
       coalesce(sum(v.engagement_total), 0)::integer                as engagement_total
  from compat.li_profile_base p
  join compat.v_li_profiles v on v.id = p.id
 group by p.band;

create or replace view compat.v_li_edges as
select e.author_slug,
       max(e.author_name) as author_name,
       max(e.author_url)  as author_url,
       count(*)::integer                     as edges,
       count(distinct e.profile_id)::integer as reached_by,
       exists (select 1 from signals.linkedin_account_detail d
                where d.slug = e.author_slug) as in_roster
  from compat.linkedin_engagement e
 where e.author_slug is not null
 group by e.author_slug;

create or replace view compat.v_li_runs as
select r.id,
       r.band,
       r.kind,
       r.started_at,
       r.finished_at,
       r.apify_run_id,
       r.profiles_queried,
       r.items_returned,
       r.authored_kept,
       r.engagement_kept,
       r.no_result_count,
       r.charged_usd,
       r.status,
       r.error,
       case when r.items_returned > 0
            then round(100.0 * r.authored_kept::numeric / r.items_returned::numeric, 1)
            else null::numeric end as authored_pct,
       case when r.authored_kept > 0
            then round(r.charged_usd / r.authored_kept::numeric, 5)
            else null::numeric end as usd_per_post,
       extract(epoch from r.finished_at - r.started_at)::integer as duration_s
  from compat.linkedin_sweep_run r;

commit;
