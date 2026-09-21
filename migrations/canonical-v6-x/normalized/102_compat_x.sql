-- 102_compat_x.sql
--
-- compat views reproducing the 14 legacy X resources the dashboard reads, so
-- /api/x/* keeps working against canonical data.
--
-- The legacy X schema was one wide table per concept, with the numeric X
-- user_id as the join key everywhere. Canonical splits that into the shared
-- account model (signals.platform_account), the X-specific extras
-- (signals.x_account_detail), the shared content model
-- (public.content_item + signals.content_x_post), and append-only series for
-- everything that changes over time. These views put the wide shape back.
--
-- THREE TRANSLATIONS ARE WORTH KNOWING ABOUT.
--
-- 1. IDENTITY. Legacy keys on the numeric user_id as text. Canonical keys on
--    a uuid and keeps the numeric id in platform_account.platform_account_id.
--    Every view projects the numeric id back out as user_id, so the app's
--    filters (user_id=eq.<n>) keep matching.
--
-- 2. COUNTERS ARE A TIME SERIES, NOT COLUMNS. followers, following_count,
--    tweet_count and listed_count were mutable columns that lost their old
--    value on every sync. They are now observations in the append-only
--    signals.account_metric. The latest observation per (account, kind) is
--    what the legacy column held, so x_latest_account_metric pivots exactly
--    that back into columns. Same for post engagement via content_metric.
--
--    DISTINCT ON is used rather than a window function because it is the
--    cheapest way to take one row per group against the existing
--    (platform_account_id, kind, observed_at) index.
--
-- 3. ENGAGEMENT SCORE. Legacy x_posts stored engagement_score as a column.
--    It is recomputed here from the same inputs rather than stored, so it
--    cannot drift away from the metrics it summarises.
--
--    The weights are LIKE=1, REPOST=2, REPLY=3, taken from
--    xsync/transform.py:engagement_score, which is the code that wrote the
--    legacy column. Quotes are NOT a term. An earlier revision here guessed
--    likes + 2*(retweets+replies+quotes), which ranked the feed differently
--    and silently changed which posts surfaced.

begin;

-- ---------------------------------------------------------------- helpers

-- MATERIALIZED, not a plain view. These two rollups are read by every other
-- X relation, and as plain views the planner is free to re-evaluate them once
-- per outer row. It did exactly that on /api/x/posts: the aggregate over
-- account_metric ran with loops=3721, re-sorting all 16,072 rows each time,
-- and a 60-row page took 31s. Materializing turns each into a small indexed
-- table, so the same nested loop becomes an index lookup.
--
-- Safe to materialize because both metric tables are APPEND-ONLY and
-- trigger-enforced (account_metric_no_update/no_delete,
-- tg_content_metric_append_only): a refresh can only ever add newer
-- observations, never rewrite history. refresh_x_rollups() below is called by
-- the loader after each ingest, so freshness is tied to the write path rather
-- than to a timer.
-- An earlier revision created these as PLAIN views, so the drop has to cope
-- with either state. DROP VIEW refuses to remove a materialized view and DROP
-- MATERIALIZED VIEW refuses to remove a plain one -- and because each raises
-- rather than skipping, simply listing both aborts the migration on re-run.
-- The catalog decides which form to issue, which makes this file idempotent
-- from a clean database, from the plain-view state, and from itself.
do $$
declare r record;
begin
  for r in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'compat'
       and c.relname in ('x_latest_account_metric', 'x_latest_post_metric')
  loop
    if r.relkind = 'm' then
      execute format('drop materialized view if exists compat.%I cascade', r.relname);
    else
      execute format('drop view if exists compat.%I cascade', r.relname);
    end if;
  end loop;
end $$;

create materialized view compat.x_latest_account_metric as
select
  m.platform_account_id,
  max(m.value) filter (where m.kind = 'follower')   as followers,
  max(m.value) filter (where m.kind = 'following')  as following_count,
  max(m.value) filter (where m.kind = 'post')       as tweet_count,
  max(m.value) filter (where m.kind = 'subscriber') as listed_count
from (
  select distinct on (am.platform_account_id, am.kind)
         am.platform_account_id, am.kind, am.value
    from signals.account_metric am
   order by am.platform_account_id, am.kind, am.observed_at desc
) m
group by m.platform_account_id;

create materialized view compat.x_latest_post_metric as
select
  m.content_item_id,
  max(m.value) filter (where m.kind = 'like')     as likes,
  max(m.value) filter (where m.kind = 'repost')   as retweets,
  max(m.value) filter (where m.kind = 'reply')    as replies,
  max(m.value) filter (where m.kind = 'quote')    as quotes,
  max(m.value) filter (where m.kind = 'view')     as impressions,
  max(m.value) filter (where m.kind = 'bookmark') as bookmark_count
from (
  select distinct on (cm.content_item_id, cm.kind)
         cm.content_item_id, cm.kind, cm.value
    from public.content_metric cm
   order by cm.content_item_id, cm.kind, cm.observed_at desc
) m
group by m.content_item_id;

-- --------------------------------------------------------------- accounts

create or replace view compat.x_accounts as
select
  pa.platform_account_id                  as user_id,
  pa.handle                               as username,
  pa.display_name                         as name,
  pa.description,
  pa.location,
  pa.url,
  pa.avatar_url                           as profile_image_url,
  pa.is_verified                          as verified,
  coalesce(lm.followers, 0)               as followers,
  coalesce(lm.following_count, 0)         as following_count,
  coalesce(lm.tweet_count, 0)             as tweet_count,
  coalesce(lm.listed_count, d.listed_count, 0) as listed_count,
  pa.account_created_at,
  d.is_following,
  d.categories,
  pa.first_seen_at                        as first_seen,
  d.profile_synced_at,
  pa.raw
from signals.platform_account pa
join signals.x_account_detail d on d.platform_account_id = pa.id
left join compat.x_latest_account_metric lm on lm.platform_account_id = pa.id
where pa.platform = 'x'
  and pa.platform_account_id is not null;

-- ------------------------------------------------------------------ posts

create or replace view compat.x_posts as
select
  xp.tweet_id,
  author.platform_account_id              as author_id,
  author.handle                           as author_username,
  ci.published_at                         as posted_at,
  ci.body_text                            as text,
  ci.language                             as lang,
  coalesce(pm.likes, 0)                   as likes,
  coalesce(pm.retweets, 0)                as retweets,
  coalesce(pm.replies, 0)                 as replies,
  coalesce(pm.quotes, 0)                  as quotes,
  coalesce(pm.impressions, 0)             as impressions,
  coalesce(pm.bookmark_count, 0)          as bookmark_count,
  -- Recomputed, never stored: see note 3 in the header.
  (coalesce(pm.likes, 0)
     + coalesce(pm.retweets, 0) * 2
     + coalesce(pm.replies, 0) * 3)       as engagement_score,
  xp.conversation_id,
  xp.is_reply,
  xp.is_quote,
  xp.is_repost                            as is_retweet,
  -- Folded back into the text[] the legacy column held, so the Posts tab
  -- filter (&sources=cs.{list}) keeps working against a normalized child
  -- table. An earlier revision read ci.raw->'sources', which returned JSON
  -- nulls for every row: that key is not in the archived payload.
  coalesce(ps.sources, array[]::text[]) as sources,
  xp.entities,
  xp.referenced,
  ci.raw,
  xp.synced_at
from signals.content_x_post xp
join public.content_item ci on ci.id = xp.content_item_id
left join signals.platform_account author on author.id = xp.author_account_id
left join compat.x_latest_post_metric pm on pm.content_item_id = ci.id
left join (
  select content_item_id, array_agg(source order by source) as sources
    from signals.x_post_source
   group by content_item_id
) ps on ps.content_item_id = ci.id;

-- x_post_metrics measures tweets CITED BY ARTICLES, which is a different
-- population from x_posts -- only one row overlaps. It is reconstructed from
-- the metric series attached to whichever content item carries that tweet's
-- URL, so a cited tweet does not need a duplicate post row to be measured.
--
-- Membership comes from the explicit 'x-cited-post' capture, not from a
-- predicate. "Has a metric" would drop the deleted and protected posts that
-- legacy still lists with is_unresolved, and "is not an x_post" would drop
-- the tweet that belongs to both populations. A row with no metrics is
-- exactly an unresolved one, so the join is left.
create or replace view compat.x_post_metrics as
select
  substring(ci.url from '/status/([0-9]+)') as tweet_id,
  coalesce(author.handle,
           substring(ci.url from '://[^/]*/([^/]+)/status/')) as handle,
  author.display_name                      as author_name,
  al.followers,
  ci.published_at                          as posted_at,
  pm.impressions                           as views,
  pm.likes,
  pm.replies,
  pm.retweets                              as reposts,
  pm.quotes,
  pm.bookmark_count                        as bookmarks,
  sc.fetched_at,
  (pm.content_item_id is null)             as is_unresolved
from signals.signal_capture sc
join public.content_item ci on ci.id = sc.content_item_id
left join compat.x_latest_post_metric pm on pm.content_item_id = ci.id
left join signals.content_x_post xp on xp.content_item_id = ci.id
left join signals.platform_account author on author.id = xp.author_account_id
left join compat.x_latest_account_metric al on al.platform_account_id = author.id
where sc.preset = 'x-cited-post';

-- Unique indexes are REQUIRED for REFRESH ... CONCURRENTLY, and they are also
-- what turns the per-row lookups above into index scans.
create unique index if not exists x_latest_account_metric_pk
  on compat.x_latest_account_metric (platform_account_id);
create unique index if not exists x_latest_post_metric_pk
  on compat.x_latest_post_metric (content_item_id);

-- Refreshed together because the enriched views join both. CONCURRENTLY keeps
-- reads serving the previous contents instead of blocking, which matters
-- because the dashboard is read-only and must stay up during an ingest.
-- CONCURRENTLY cannot run inside a transaction block, so this is a function
-- the loader calls after it commits rather than a statement in this migration.
create or replace function compat.refresh_x_rollups()
returns void language plpgsql as $$
begin
  refresh materialized view concurrently compat.x_latest_account_metric;
  refresh materialized view concurrently compat.x_latest_post_metric;
end;
$$;

-- ------------------------------------------------------------------ lists

create or replace view compat.x_lists as
select
  xl.list_id,
  xl.name,
  xl.description,
  -- Both are what X REPORTS for the list, stored on signals.x_list. An
  -- earlier revision counted x_list_member rows for member_count and
  -- hardcoded follower_count to 0, which conflated the counts we hold with
  -- the counts X publishes and silently zeroed a real column. The
  -- membership rollup we compute is stored_members in v_x_lists_enriched,
  -- which is deliberately a separate fact.
  xl.member_count,
  xl.follower_count,
  xl.is_private,
  owner.platform_account_id               as owner_id,
  xl.list_created_at,
  xl.members_synced_at,
  xl.timeline_synced_at
from signals.x_list xl
left join signals.platform_account owner on owner.id = xl.owner_account_id;

create or replace view compat.x_list_members as
select
  xl.list_id,
  pa.platform_account_id                  as user_id,
  m.first_seen_at                         as added_seen_at
from signals.x_list_member m
join signals.x_list xl on xl.id = m.x_list_id
join signals.platform_account pa on pa.id = m.platform_account_id;

-- ----------------------------------------------------------------- scores

create or replace view compat.x_account_scores as
select
  s.id,
  pa.platform_account_id                  as user_id,
  s.scored_at,
  s.score,
  s.reach,
  s.engagement,
  s.cadence,
  s.curation,
  s.components
from signals.account_score s
join signals.platform_account pa on pa.id = s.platform_account_id
where pa.platform = 'x';

create or replace view compat.v_x_account_scores_latest as
select distinct on (pa.platform_account_id)
  pa.platform_account_id                  as user_id,
  s.scored_at,
  s.score,
  s.reach,
  s.engagement,
  s.cadence,
  s.curation,
  s.components
from signals.account_score s
join signals.platform_account pa on pa.id = s.platform_account_id
where pa.platform = 'x'
order by pa.platform_account_id, s.scored_at desc;

-- ------------------------------------------------- bookmarks and captures

create or replace view compat.x_bookmarks as
select
  xp.tweet_id,
  b.position,
  b.synced_at
from signals.x_bookmark b
join signals.content_x_post xp on xp.content_item_id = b.content_item_id;

-- The 'x-cited-post' preset is excluded: it marks the metrics-refresh
-- population (see compat.x_post_metrics), not a legacy discovery preset, and
-- letting it through here would invent rows legacy never had.
create or replace view compat.x_signals as
select
  xp.tweet_id,
  sc.preset,
  sc.fetched_at
from signals.signal_capture sc
join signals.content_x_post xp on xp.content_item_id = sc.content_item_id
where sc.preset <> 'x-cited-post';

-- --------------------------------------------------------------- clusters

-- Membership is stored relationally and folded back into the legacy
-- tweet_ids array here, ordered by the rank the cluster assigned.
create or replace view compat.x_clusters as
select
  c.id,
  c.preset,
  c.label,
  c.summary,
  coalesce(
    (select array_agg(xp.tweet_id order by mem.rank)
       from signals.content_cluster_member mem
       join signals.content_x_post xp on xp.content_item_id = mem.content_item_id
      where mem.content_cluster_id = c.id),
    '{}'::text[]
  )                                       as tweet_ids,
  (select count(*) from signals.content_cluster_member mem
    where mem.content_cluster_id = c.id)  as size,
  c.top_engagement,
  c.built_at
from signals.content_cluster c;

-- ------------------------------------------------------------- sync runs

create or replace view compat.x_sync_runs as
select
  r.id,
  coalesce(r.params ->> 'legacy_kind', r.kind::text) as kind,
  r.status::text,
  r.started_at,
  r.finished_at,
  r.api_calls,
  r.est_cost_usd,
  (r.summary -> 'items')                  as items,
  (r.summary -> 'detail')                 as detail,
  r.error
from signals.job_run r
where r.kind = 'x_sync';

-- ------------------------------------------------------- enriched views

-- The per-account rollups are pre-aggregated and joined on the uuid rather
-- than written as correlated subqueries over compat.x_posts keyed on the
-- text user_id. The correlated form re-derived every post and its metrics
-- once per account and took 8.5s to scan; this form groups each base table
-- once and joins on the indexed key, which is ~40x faster and is what makes
-- /api/x/accounts usable.
create or replace view compat.v_x_accounts_ranked as
with post_rollup as (
  select
    xp.author_account_id                  as platform_account_id,
    count(*)                              as post_count,
    coalesce(max(coalesce(pm.likes, 0)
                 + coalesce(pm.retweets, 0) * 2
                 + coalesce(pm.replies, 0) * 3), 0) as top_engagement
  from signals.content_x_post xp
  left join compat.x_latest_post_metric pm on pm.content_item_id = xp.content_item_id
  where xp.author_account_id is not null
  group by xp.author_account_id
),
list_rollup as (
  select platform_account_id, count(*) as list_count
    from signals.x_list_member
   group by platform_account_id
)
select
  pa.platform_account_id                  as user_id,
  a.username,
  a.name,
  a.description,
  a.profile_image_url,
  a.verified,
  a.followers,
  a.following_count,
  a.tweet_count,
  a.listed_count,
  a.is_following,
  a.profile_synced_at,
  s.score,
  s.reach,
  s.engagement,
  s.cadence,
  s.curation,
  s.scored_at,
  coalesce(lr.list_count, 0)              as list_count,
  coalesce(pr.post_count, 0)              as post_count,
  coalesce(pr.top_engagement, 0)          as top_engagement
from signals.platform_account pa
join compat.x_accounts a on a.user_id = pa.platform_account_id
left join compat.v_x_account_scores_latest s on s.user_id = pa.platform_account_id
left join post_rollup pr on pr.platform_account_id = pa.id
left join list_rollup lr on lr.platform_account_id = pa.id
where pa.platform = 'x'
  and pa.platform_account_id is not null;

create or replace view compat.v_x_posts_enriched as
select
  p.tweet_id,
  p.author_id,
  p.author_username,
  a.name                                  as author_name,
  a.profile_image_url,
  a.followers                             as author_followers,
  a.verified                              as author_verified,
  p.posted_at,
  p.text,
  p.lang,
  p.likes,
  p.retweets,
  p.replies,
  p.quotes,
  p.impressions,
  p.bookmark_count,
  p.engagement_score,
  p.is_reply,
  p.is_quote,
  p.sources,
  p.synced_at,
  (b.tweet_id is not null)                as is_bookmarked
from compat.x_posts p
left join compat.x_accounts a on a.user_id = p.author_id
left join compat.x_bookmarks b on b.tweet_id = p.tweet_id;

create or replace view compat.v_x_lists_enriched as
select
  l.list_id,
  l.name,
  l.description,
  l.member_count,
  l.follower_count,
  l.is_private,
  l.members_synced_at,
  l.timeline_synced_at,
  coalesce(r.stored_members, 0)           as stored_members,
  coalesce(r.total_followers, 0)          as total_followers,
  coalesce(r.posts, 0)                    as posts
from compat.x_lists l
-- Same reasoning as v_x_accounts_ranked: one grouped pass over members,
-- joined on the uuid, instead of three correlated scans per list.
left join (
  select
    xl.list_id,
    count(*)                                        as stored_members,
    coalesce(sum(coalesce(am.followers, 0)), 0)     as total_followers,
    coalesce(sum(coalesce(pr.post_count, 0)), 0)    as posts
  from signals.x_list_member m
  join signals.x_list xl on xl.id = m.x_list_id
  left join compat.x_latest_account_metric am
         on am.platform_account_id = m.platform_account_id
  left join (
    select author_account_id, count(*) as post_count
      from signals.content_x_post
     where author_account_id is not null
     group by author_account_id
  ) pr on pr.author_account_id = m.platform_account_id
  group by xl.list_id
) r on r.list_id = l.list_id;

commit;
