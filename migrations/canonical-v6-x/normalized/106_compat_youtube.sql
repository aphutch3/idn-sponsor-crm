-- 106_compat_youtube.sql
--
-- compat views reproducing the 6 legacy YouTube resources the dashboard reads,
-- so /api/youtube/* serves from canonical tables unchanged. Rebuilt against
-- ytsync/views.sql -- the code that DEFINES the legacy views -- rather than
-- inferred from their output. Three behaviours a reconstruction got wrong that
-- the real definition settles:
--
--   * Terms are split on WHITESPACE ALONE and then stripped down to the
--     characters that carry meaning in this domain (c++, gpt-4, #1, node.js).
--     Splitting on non-word characters instead shattered "gpt-5.2" into three
--     terms and lost 984 real ones.
--   * `precision` is derived from the relative TEXT ('%year%' -> coarse), not
--     from whether the timestamp was estimated. Every row is estimated, so the
--     latter collapsed the column onto a single value and destroyed the very
--     distinction it exists to carry.
--   * per_week floors the span at ONE WEEK, so a channel with a single video
--     reports its own count instead of a spike.
--
-- The 201-word stopword list moves out of the view body into
-- signals.title_stopword. In the legacy view it was DDL, so adding a stopword
-- meant a migration, and the list could not be queried, counted, or shared
-- with the tag pipeline that needs the same list.

begin;

create table if not exists signals.title_stopword (
  term text primary key
);

comment on table signals.title_stopword is
  'Words excluded from title-derived term counts. Data, not DDL: the legacy view hardcoded these 201 words in its body, so the list could not be queried or reused.';

insert into signals.title_stopword (term) values
  ('the'),
  ('and'),
  ('for'),
  ('you'),
  ('with'),
  ('this'),
  ('that'),
  ('are'),
  ('from'),
  ('how'),
  ('what'),
  ('why'),
  ('who'),
  ('can'),
  ('all'),
  ('new'),
  ('now'),
  ('not'),
  ('has'),
  ('have'),
  ('had'),
  ('was'),
  ('were'),
  ('his'),
  ('her'),
  ('its'),
  ('our'),
  ('their'),
  ('they'),
  ('them'),
  ('out'),
  ('get'),
  ('got'),
  ('just'),
  ('one'),
  ('two'),
  ('more'),
  ('most'),
  ('make'),
  ('made'),
  ('use'),
  ('using'),
  ('used'),
  ('like'),
  ('than'),
  ('then'),
  ('when'),
  ('where'),
  ('into'),
  ('your'),
  ('about'),
  ('after'),
  ('before'),
  ('over'),
  ('under'),
  ('only'),
  ('also'),
  ('some'),
  ('any'),
  ('been'),
  ('being'),
  ('will'),
  ('would'),
  ('could'),
  ('should'),
  ('may'),
  ('must'),
  ('does'),
  ('did'),
  ('done'),
  ('here'),
  ('there'),
  ('these'),
  ('those'),
  ('very'),
  ('much'),
  ('still'),
  ('even'),
  ('well'),
  ('way'),
  ('see'),
  ('say'),
  ('says'),
  ('said'),
  ('know'),
  ('think'),
  ('want'),
  ('need'),
  ('take'),
  ('give'),
  ('goes'),
  ('going'),
  ('come'),
  ('comes'),
  ('look'),
  ('looks'),
  ('back'),
  ('best'),
  ('good'),
  ('great'),
  ('better'),
  ('first'),
  ('last'),
  ('next'),
  ('every'),
  ('each'),
  ('other'),
  ('own'),
  ('same'),
  ('such'),
  ('off'),
  ('again'),
  ('once'),
  ('while'),
  ('during'),
  ('between'),
  ('both'),
  ('few'),
  ('many'),
  ('lot'),
  ('too'),
  ('via'),
  ('per'),
  ('let'),
  ('lets'),
  ('dont'),
  ('doesnt'),
  ('cant'),
  ('wont'),
  ('isnt'),
  ('arent'),
  ('youre'),
  ('weve'),
  ('ive'),
  ('thats'),
  ('whats'),
  ('heres'),
  ('theres'),
  ('part'),
  ('full'),
  ('free'),
  ('top'),
  ('ep'),
  ('episode'),
  ('video'),
  ('watch'),
  ('live'),
  ('update'),
  ('updates'),
  ('news'),
  ('today'),
  ('week'),
  ('day'),
  ('days'),
  ('year'),
  ('years'),
  ('time'),
  ('times'),
  ('things'),
  ('thing'),
  ('people'),
  ('really'),
  ('actually'),
  ('finally'),
  ('never'),
  ('always'),
  ('ever'),
  ('yet'),
  ('already'),
  ('because'),
  ('without'),
  ('against'),
  ('through'),
  ('around'),
  ('across'),
  ('along'),
  ('down'),
  ('up'),
  ('on'),
  ('in'),
  ('at'),
  ('to'),
  ('of'),
  ('a'),
  ('an'),
  ('is'),
  ('it'),
  ('as'),
  ('by'),
  ('be'),
  ('or'),
  ('if'),
  ('so'),
  ('no'),
  ('my'),
  ('me'),
  ('we'),
  ('he'),
  ('she'),
  ('do'),
  ('and/or')
on conflict (term) do nothing;

-- ------------------------------------------------------------------ channels
create or replace view compat.yt_channels as
select
  pa.platform_account_id                  as channel_id,
  -- A YouTube PLAYLIST has no @handle, but platform_account.handle is NOT NULL
  -- because it is the identity for every other platform. The loader therefore
  -- stores the channel id as a surrogate, and a surrogate must not be
  -- presented as a handle: one source_kind='playlist' row is affected today.
  nullif(pa.handle, pa.platform_account_id) as handle,
  pa.display_name                         as title,
  pa.description,
  pa.avatar_url,
  pa.url,
  d.beat,
  d.list_name,
  d.note,
  d.source_kind,
  d.playlist_id,
  -- NULL on all 50 legacy channels, so nothing was loaded into the metric
  -- series. Read from the series rather than hardcoded NULL so these light up
  -- automatically once a Data API pass populates them.
  sub.value                               as subscribers,
  vids.value                              as video_count,
  views.value                             as view_count,
  pa.is_monitored                         as is_active,
  d.last_video_at,
  d.last_ingested_at,
  d.first_ingested_at,
  pa.created_at,
  pa.updated_at
from signals.platform_account pa
join signals.youtube_channel_detail d on d.platform_account_id = pa.id
left join lateral (
  select m.value from signals.account_metric m
   where m.platform_account_id = pa.id and m.kind = 'subscriber'
   order by m.observed_at desc limit 1
) sub on true
left join lateral (
  select m.value from signals.account_metric m
   where m.platform_account_id = pa.id and m.kind = 'video'
   order by m.observed_at desc limit 1
) vids on true
left join lateral (
  select m.value from signals.account_metric m
   where m.platform_account_id = pa.id and m.kind = 'view'
   order by m.observed_at desc limit 1
) views on true
where pa.platform = 'youtube';

-- -------------------------------------------------------------------- videos
create or replace view compat.yt_videos as
select
  v.video_id,
  chan.platform_account_id                as channel_id,
  ci.title,
  ci.body_text                            as description,
  -- Exposed only when the instant is genuinely exact, so a consumer reading
  -- published_at cannot mistake a rounded guess for a measurement.
  case when v.is_published_estimated then null else ci.published_at end
                                          as published_at,
  v.published_text,
  ci.published_at                         as published_est,
  v.duration_seconds,
  vm.views                                as view_count,
  vm.likes                                as like_count,
  vm.comments                             as comment_count,
  v.thumbnail_url,
  v.is_short,
  v.ingest_depth::text                    as depth,
  v.ingested_at,
  ci.updated_at
from signals.content_youtube_video v
join public.content_item ci on ci.id = v.content_item_id
left join signals.platform_account chan on chan.id = v.channel_account_id
left join lateral (
  select
    max(m.value) filter (where m.kind = 'view')    as views,
    max(m.value) filter (where m.kind = 'like')    as likes,
    max(m.value) filter (where m.kind = 'comment') as comments
  from (
    select distinct on (cm.kind) cm.kind, cm.value
      from public.content_metric cm
     where cm.content_item_id = ci.id
       and cm.kind in ('view', 'like', 'comment')
     order by cm.kind, cm.observed_at desc
  ) m
) vm on true;

-- ----------------------------------------------------------------- sync runs
create or replace view compat.yt_sync_runs as
select
  -- The legacy integer id, recovered from external_ref rather than stored a
  -- second time on job_run. Guarded because a view select-list cast is not
  -- guaranteed to run after the view WHERE clause, and external_ref holds
  -- non-numeric ids from other sources -- see 112.
  public.legacy_bigint(er.external_id, 'yt_sync_runs') as id,
  r.params ->> 'job'                      as job,
  r.params ->> 'backend'                  as backend,
  r.status::text                          as status,
  r.started_at,
  r.finished_at,
  (r.params ->> 'channels')::int          as channels,
  (r.params ->> 'items_read')::int        as items_read,
  (r.params ->> 'items_written')::int     as items_written,
  r.api_calls,
  r.est_cost_usd,
  (r.params ->> 'quota_units')::int       as quota_units,
  r.params -> 'params'                    as params,
  r.summary,
  r.error
from signals.job_run r
join public.external_ref er
  on er.entity_table = 'job_run'
 and er.entity_id = r.id
 and er.source_system = 'news_dashboard'
 and er.external_id like 'yt_sync_runs:%'
where r.kind = 'youtube_sync';

-- --------------------------------------------------------- channel rollups --
-- One row per registered channel, INCLUDING channels with zero videos so a
-- coverage gap stays visible instead of dropping out of the list.
create or replace view compat.v_yt_channels_ranked as
with vid as (
  select
    v.channel_account_id                                   as acct,
    count(*)                                               as video_count,
    count(*) filter (where v.is_short)                     as shorts,
    coalesce(sum(vm.views), 0)                             as total_views,
    round(avg(vm.views))                                   as avg_views,
    percentile_cont(0.5) within group (order by vm.views::numeric) as median_views,
    max(vm.views)                                          as top_views,
    round(avg(v.duration_seconds))                         as avg_duration,
    min(ci.published_at)                                   as first_published,
    max(ci.published_at)                                   as last_published
  from signals.content_youtube_video v
  join public.content_item ci on ci.id = v.content_item_id
  left join lateral (
    select cm.value as views
      from public.content_metric cm
     where cm.content_item_id = ci.id and cm.kind = 'view'
     order by cm.observed_at desc limit 1
  ) vm on true
  group by v.channel_account_id
)
select
  pa.platform_account_id                  as channel_id,
  -- See compat.yt_channels: a surrogate handle is not a handle.
  nullif(pa.handle, pa.platform_account_id) as handle,
  pa.display_name                         as title,
  d.beat,
  d.list_name,
  pa.url,
  pa.avatar_url,
  d.source_kind,
  pa.is_monitored                         as is_active,
  d.last_video_at,
  d.last_ingested_at,
  coalesce(vid.video_count, 0)            as video_count,
  coalesce(vid.shorts, 0)                 as shorts,
  coalesce(vid.total_views, 0)            as total_views,
  vid.avg_views,
  vid.median_views,
  vid.top_views,
  vid.avg_duration,
  vid.first_published,
  vid.last_published,
  -- Uploads per week across the window actually covered. The span is floored
  -- at one week so a channel with a single video reports its own count rather
  -- than dividing by ~0 and reporting a spike.
  case
    when coalesce(vid.video_count, 0) = 0 then 0
    else round(
      vid.video_count::numeric /
      greatest(
        extract(epoch from (vid.last_published - vid.first_published)) / 604800.0,
        1
      ), 2)
  end                                     as per_week
from signals.platform_account pa
join signals.youtube_channel_detail d on d.platform_account_id = pa.id
left join vid on vid.acct = pa.id
where pa.platform = 'youtube';

-- ------------------------------------------------------- publishing trends --
create or replace view compat.v_yt_monthly as
select
  date_trunc('month', ci.published_at)::date as month,
  coalesce(d.beat, 'Unassigned')             as beat,
  -- The free listing backend only gives relative labels. Anything coarser
  -- than a month collapses onto the window's oldest month, so the precision
  -- travels with the row and the UI charts only what can honestly be dated.
  case
    when v.published_text is null          then 'unknown'
    when v.published_text ilike '%year%'   then 'coarse'
    else 'month'
  end                                        as precision,
  count(*)                                   as videos,
  count(distinct v.channel_account_id)       as channels,
  coalesce(sum(vm.views), 0)                 as views,
  round(avg(vm.views))                       as avg_views
from signals.content_youtube_video v
join public.content_item ci on ci.id = v.content_item_id
join signals.youtube_channel_detail d on d.platform_account_id = v.channel_account_id
left join lateral (
  select cm.value as views
    from public.content_metric cm
   where cm.content_item_id = ci.id and cm.kind = 'view'
   order by cm.observed_at desc limit 1
) vm on true
where ci.published_at is not null
group by 1, 2, 3;

-- -------------------------------------------------------------- title terms --
-- What the channels say they cover, counted across videos. Interim signal
-- until transcript tagging runs.
create or replace view compat.v_yt_title_terms as
with words as (
  select
    v.content_item_id,
    v.channel_account_id,
    vm.views,
    ci.published_at,
    -- Strip surrounding punctuation but keep the characters that carry
    -- meaning in this domain: c++, gpt-4, #1, node.js
    trim(both '.-' from
      lower(regexp_replace(w, '[^A-Za-z0-9+#\.\-]', '', 'g'))
    ) as term
  from signals.content_youtube_video v
  join public.content_item ci on ci.id = v.content_item_id
  left join lateral (
    select cm.value as views
      from public.content_metric cm
     where cm.content_item_id = ci.id and cm.kind = 'view'
     order by cm.observed_at desc limit 1
  ) vm on true,
  -- Fold the possessive away first (straight, curly and modifier-letter
  -- apostrophes all appear in real titles) so "OpenAI" and "OpenAI's" are one
  -- term instead of two entries a row apart in the list.
  lateral regexp_split_to_table(
    regexp_replace(coalesce(ci.title, ''), '[''\u2019\u02BC]s\M', '', 'g'),
    '\s+'
  ) as w
)
select
  term,
  count(distinct content_item_id)    as videos,
  count(distinct channel_account_id) as channels,
  coalesce(sum(views), 0)            as views,
  round(avg(views))                  as avg_views,
  min(published_at)                  as first_seen,
  max(published_at)                  as last_seen
from words
where length(term) >= 3
  and term ~ '[a-z]'
  and not exists (select 1 from signals.title_stopword s where s.term = words.term)
group by term;

comment on view compat.v_yt_channels_ranked is
  'Per-channel rollups for the YouTube workspace. Includes zero-video channels so coverage gaps stay visible.';
comment on view compat.v_yt_monthly is
  'Monthly publishing volume and reach by beat. precision=coarse marks videos whose only date signal was a year-level relative label; they all collapse onto the oldest month and must not be charted as real monthly volume.';
comment on view compat.v_yt_title_terms is
  'Title-derived topic terms, with the possessive folded away. Interim signal until transcript tagging runs.';

commit;
