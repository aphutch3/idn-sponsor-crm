-- 116_compat_github.sql
--
-- The compatibility layer the dashboard's nine GitHub routes read. Each view
-- hands back exactly the column names and shapes the legacy Supabase tables
-- and views did, over the canonical tables.
--
-- Two things the canonical model does differently, and why the compat layer
-- can still be exact:
--
-- 1. A repo's star/fork/watcher counts are not columns on the repo. They are
--    observations in content_metric, the same as every other measurement in
--    this database. gh_current_metric pivots the LATEST observation per kind
--    back into the column shape the routes expect.
--
-- 2. gh_people's six counters (repos_count, commits_total, ...) were stored on
--    the person AND derivable from the contributor rows, which is exactly the
--    arrangement that lets the two disagree. They are recomputed here.

begin;

-- ------------------------------------------------------ legacy id recovery
create or replace view compat.gh_run_id as
select er.entity_id as job_run_id,
       public.legacy_bigint(er.external_id, 'gh_sync_runs') as id
  from public.external_ref er
 where er.entity_table = 'job_run'
   and er.source_system = 'news_dashboard'
   and er.external_id like 'gh_sync_runs:%';

-- --------------------------------------------------------- current metrics
--
-- The latest value per (repo, kind) in one pass. Written as a correlated
-- subquery per column first; that shape cost seconds on the LinkedIn posts
-- view because each row reopened content_metric once per column.
create or replace view compat.gh_current_metric as
select cm.content_item_id,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'star'))[1]::integer        as stars,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'fork'))[1]::integer        as forks,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'watcher'))[1]::integer     as watchers,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'open_issue'))[1]::integer  as open_issues,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'open_pr'))[1]::integer     as open_prs,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'contributor'))[1]::integer as contributors,
       (array_agg(cm.value order by cm.observed_at desc)
          filter (where cm.kind = 'release'))[1]::integer     as releases
  from public.content_metric cm
  join signals.content_github_repo g on g.content_item_id = cm.content_item_id
 where cm.kind in ('star', 'fork', 'watcher', 'open_issue', 'open_pr',
                   'contributor', 'release')
 group by cm.content_item_id;

-- ------------------------------------------------------------------- repos
create or replace view compat.gh_repos as
select g.repo_id,
       g.owner_login  as owner,
       g.repo_name    as name,
       ci.title       as project_name,
       g.primary_language,
       g.license,
       ci.summary     as description,
       g.homepage,
       ci.url         as repo_url,
       g.is_archived,
       g.repo_created_at,
       g.pushed_at,
       g.last_release_at,
       g.metrics_fetched_at,
       g.size_kb,
       g.baseline_stars,
       g.baseline_forks,
       g.baseline_issues,
       g.observed_company_owner  as company_owner,
       g.observed_company_domain as company_domain,
       g.company_id,
       g.baseline_as_of,
       m.stars, m.forks, m.watchers, m.open_issues, m.open_prs,
       m.contributors, m.releases,
       g.is_monitored as is_active,
       ci.raw,
       ci.created_at,
       ci.updated_at
  from signals.content_github_repo g
  join public.content_item ci on ci.id = g.content_item_id
  left join compat.gh_current_metric m on m.content_item_id = g.content_item_id;

create or replace view compat.gh_repo_categories as
select c.content_item_id,
       g.repo_id,
       c.macro_category,
       c.group_name,
       c.subcategory,
       c.is_primary
  from signals.repo_category c
  join signals.content_github_repo g on g.content_item_id = c.content_item_id;

-- ------------------------------------------------------------- ranked repos
--
-- Every derived column below is computed exactly as the legacy view computed
-- it, including which rows get NULL rather than zero: a repo with no baseline
-- has no delta, and pretending otherwise would put it at the bottom of a
-- momentum sort instead of out of it.
create or replace view compat.v_gh_repos_ranked as
with primary_cat as (
  select distinct on (c.content_item_id)
         c.content_item_id, c.macro_category, c.group_name, c.subcategory
    from signals.repo_category c
   order by c.content_item_id, c.is_primary desc,
            c.macro_category, c.group_name, c.subcategory
)
-- company_owner and company_domain are read from the values this source
-- OBSERVED, not from the company the repo resolves to: 95 of the 192 domains
-- matched a company that already existed in the shared table under its own
-- canonical name, and the legacy view showed this dataset's spelling. The
-- company_id link is the identity; these two are what this source said.
select r.repo_id, r.owner, r.name, r.project_name,
       r.company_owner,
       r.company_domain,
       r.repo_url, r.description, r.homepage, r.primary_language, r.license,
       r.is_archived, r.repo_created_at, r.pushed_at,
       r.stars, r.forks, r.watchers, r.open_issues, r.open_prs,
       r.contributors, r.releases, r.last_release_at, r.size_kb,
       r.metrics_fetched_at, r.baseline_stars, r.baseline_as_of,
       c.macro_category, c.group_name, c.subcategory,
       (select count(*) from signals.repo_category gc
         where gc.content_item_id = g.content_item_id) as category_count,
       case when r.stars is not null and r.baseline_stars is not null
            then r.stars - r.baseline_stars end as stars_delta,
       case when r.stars is not null and r.baseline_stars is not null
             and r.baseline_stars > 0
            then round(100.0 * (r.stars - r.baseline_stars)::numeric
                       / r.baseline_stars::numeric, 2) end as stars_delta_pct,
       case when r.stars is not null and r.baseline_stars is not null
             and r.baseline_as_of is not null
             and r.metrics_fetched_at::date > r.baseline_as_of
            then round((r.stars - r.baseline_stars)::numeric
                       / (r.metrics_fetched_at::date - r.baseline_as_of)::numeric, 2)
            end as stars_per_day,
       case when r.repo_created_at is not null and r.stars is not null
            then round(r.stars::numeric
                       / greatest(1, current_date - r.repo_created_at::date)::numeric, 2)
            end as stars_per_day_lifetime,
       case when r.repo_created_at is not null
            then current_date - r.repo_created_at::date end as repo_age_days,
       case when r.pushed_at is not null
            then current_date - r.pushed_at::date end as days_since_push,
       case when r.stars is not null and r.forks is not null and r.stars > 0
            then round(r.forks::numeric / r.stars::numeric, 4)
            end as fork_star_ratio,
       case when r.stars is not null and r.open_issues is not null and r.stars > 0
            then round(1000.0 * r.open_issues::numeric / r.stars::numeric, 2)
            end as issues_per_1k_stars
  from compat.gh_repos r
  join signals.content_github_repo g on g.repo_id = r.repo_id
  left join primary_cat c on c.content_item_id = g.content_item_id
 where r.is_active;

create or replace view compat.v_gh_taxonomy as
select c.macro_category, c.group_name, c.subcategory,
       count(*) as repos,
       sum(r.stars) as stars,
       sum(r.forks) as forks,
       round(avg(r.stars)) as avg_stars,
       max(r.stars) as max_stars,
       sum(case when r.stars is not null and r.baseline_stars is not null
                then r.stars - r.baseline_stars else 0 end) as stars_delta,
       count(*) filter (where r.pushed_at > now() - interval '30 days') as active_30d,
       count(*) filter (where r.is_archived) as archived,
       count(distinct r.company_owner) as owners,
       count(distinct r.primary_language) as languages
  from signals.repo_category c
  join signals.content_github_repo g on g.content_item_id = c.content_item_id
  join compat.gh_repos r on r.repo_id = g.repo_id and r.is_active
 group by c.macro_category, c.group_name, c.subcategory;

create or replace view compat.v_gh_owners as
select coalesce(r.company_owner, r.owner) as company_owner,
       min(r.company_domain) as company_domain,
       count(*) as repos,
       sum(r.stars) as stars,
       sum(r.forks) as forks,
       sum(case when r.stars is not null and r.baseline_stars is not null
                then r.stars - r.baseline_stars else 0 end) as stars_delta,
       max(r.stars) as top_repo_stars,
       count(*) filter (where r.pushed_at > now() - interval '30 days') as active_30d,
       array_agg(distinct c.macro_category)
         filter (where c.macro_category is not null) as macro_categories
  from compat.gh_repos r
  join signals.content_github_repo g on g.repo_id = r.repo_id
  left join signals.repo_category c on c.content_item_id = g.content_item_id
 where r.is_active
 group by coalesce(r.company_owner, r.owner);

create or replace view compat.v_gh_languages as
select coalesce(r.primary_language, 'Unspecified') as language,
       count(*) as repos,
       sum(r.stars) as stars,
       round(avg(r.stars)) as avg_stars,
       sum(case when r.stars is not null and r.baseline_stars is not null
                then r.stars - r.baseline_stars else 0 end) as stars_delta,
       count(*) filter (where r.pushed_at > now() - interval '30 days') as active_30d
  from compat.gh_repos r
 where r.is_active
 group by coalesce(r.primary_language, 'Unspecified');

-- The daily series, rebuilt from the metric observations. A capture is a day
-- on which a repo was measured, so the grain is the observation date.
create or replace view compat.v_gh_daily as
select cm.observed_at::date as captured_on,
       count(distinct cm.content_item_id)
         filter (where cm.kind = 'star') as repos,
       sum(cm.value) filter (where cm.kind = 'star') as stars,
       sum(cm.value) filter (where cm.kind = 'fork') as forks,
       -- The capture's source, recovered the same way gh_repo_metrics
       -- recovers it: only the API capture carries a watcher count. Reading
       -- source_system would return the LOADER's name on every row and erase
       -- the distinction the legacy column drew. Counted inside the aggregate
       -- because this view's grain is the date, not the repo.
       case when count(*) filter (where cm.kind = 'watcher') > 0
            then 'api' else 'sheet' end as source
  from public.content_metric cm
  join signals.content_github_repo g on g.content_item_id = cm.content_item_id
  join compat.gh_repos r on r.repo_id = g.repo_id and r.is_active
 where cm.kind in ('star', 'fork', 'watcher')
 group by cm.observed_at::date;

-- ------------------------------------------------------------------ people
--
-- The six counters are READ FROM STORAGE, not derived from the contributor
-- edges. 260 people have counters but no surviving edges -- their contributor
-- rows were pruned by a later, narrower re-sync -- so deriving would report 0
-- commits for real contributors and drop 2,959 commits_90d from every total.
-- Where edges do exist the stored and derived values agree on all 6,621 rows.
create or replace view compat.gh_people as
select pa.handle as login,
       nullif(pa.platform_account_id, '')::bigint as github_id,
       pa.display_name,
       d.company_raw,
       d.company_norm,
       d.blog,
       d.twitter_username,
       pa.location,
       pa.description as bio,
       d.email,
       fm.followers,
       null::integer as following,
       d.public_repos,
       pa.avatar_url,
       pa.account_created_at,
       d.account_type::text,
       d.actor_class::text,
       d.agent_vendor,
       d.profile_fetched_at,
       d.x_username,
       d.x_user_id,
       d.x_match_method,
       d.x_matched_at,
       d.repos_count,
       d.repos_top10_count,
       d.commits_total,
       d.commits_90d,
       d.merges_observed,
       d.reach_stars,
       sc.score                          as influence,
       pa.created_at,
       pa.updated_at
  from signals.github_account_detail d
  join signals.platform_account pa on pa.id = d.platform_account_id
  left join lateral (
        select s.score from signals.account_score s
         where s.platform_account_id = pa.id
         order by s.scored_at desc limit 1) sc on true
  left join lateral (
        select am.value::integer as followers from signals.account_metric am
         where am.platform_account_id = pa.id and am.kind = 'follower'
         order by am.observed_at desc limit 1) fm on true;

-- The EXPLICIT column list the legacy view carries, in its exact order. It is
-- deliberately NOT gh_people.* -- six columns are withheld from this view:
-- github_id, email, following, x_matched_at, created_at and updated_at. Two of
-- those (email and the internal timestamps) have no business in a response the
-- Contributors tab renders, so the narrowing is the view doing its job.
--
-- x_tracked sits between x_match_method and repos_count rather than at the end,
-- because that is where the legacy view puts it.
create or replace view compat.v_gh_people_ranked as
select p.login,
       p.display_name,
       p.company_raw,
       p.company_norm,
       p.blog,
       p.twitter_username,
       p.location,
       p.bio,
       p.followers,
       p.public_repos,
       p.avatar_url,
       p.account_created_at,
       p.account_type,
       p.actor_class,
       p.agent_vendor,
       p.profile_fetched_at,
       p.x_username,
       p.x_user_id,
       p.x_match_method,
       (p.x_user_id is not null) as x_tracked,
       p.repos_count,
       p.repos_top10_count,
       p.commits_total,
       p.commits_90d,
       p.merges_observed,
       p.reach_stars,
       p.influence,
       row_number() over (order by p.influence desc, p.reach_stars desc)
         as influence_rank
  from compat.gh_people p;

-- ------------------------------------------------------------ contributors
create or replace view compat.gh_repo_contributors as
select g.repo_id,
       pa.handle as login,
       rc.commits_total, rc.commits_90d, rc.commits_365d,
       rc.first_commit_week, rc.last_commit_week, rc.weeks_active,
       rc.rank_commits, rc.prs_authored, rc.prs_merged, rc.merges_performed,
       rc.share_total, rc.share_90d, rc.importance, rc.is_top10,
       rc.computed_at as captured_at
  from signals.repo_contributor rc
  join signals.content_github_repo g on g.content_item_id = rc.content_item_id
  join signals.platform_account pa on pa.id = rc.platform_account_id;

create or replace view compat.v_gh_repo_maintainers as
select g.repo_id,
       r.owner, r.name, r.project_name, r.stars, r.primary_language,
       pa.handle as login,
       pa.display_name,
       d.company_norm,
       d.twitter_username,
       d.x_username,
       d.x_user_id,
       pa.avatar_url,
       fm.followers,
       d.actor_class::text,
       d.agent_vendor,
       rc.commits_total, rc.commits_90d, rc.commits_365d, rc.weeks_active,
       rc.first_commit_week, rc.last_commit_week, rc.rank_commits,
       rc.merges_performed, rc.prs_authored, rc.prs_merged,
       rc.share_total, rc.share_90d, rc.importance, rc.is_top10,
       cat.macro_category, cat.group_name, cat.subcategory
  from signals.repo_contributor rc
  join signals.content_github_repo g on g.content_item_id = rc.content_item_id
  join compat.gh_repos r on r.repo_id = g.repo_id
  join signals.platform_account pa on pa.id = rc.platform_account_id
  left join signals.github_account_detail d on d.platform_account_id = pa.id
  left join signals.repo_category cat
         on cat.content_item_id = g.content_item_id and cat.is_primary
  left join lateral (
        select am.value::integer as followers from signals.account_metric am
         where am.platform_account_id = pa.id and am.kind = 'follower'
         order by am.observed_at desc limit 1) fm on true;

create or replace view compat.v_gh_companies as
select p.company_norm as company,
       count(distinct p.login) as people,
       count(distinct c.repo_id) as repos,
       sum(c.commits_90d) as commits_90d,
       sum(c.merges_performed) as merges,
       count(distinct c.owner) as owners_touched,
       max(case when lower(c.owner) = lower(replace(p.company_norm, ' ', ''))
                then 1 else 0 end) as owns_any
  from compat.gh_people p
  join compat.v_gh_repo_maintainers c
    on c.login = p.login and c.is_top10
 where p.company_norm is not null and p.company_norm <> ''
   and p.actor_class = 'human'
 group by p.company_norm;

create or replace view compat.gh_pr_authority as
select g.repo_id,
       m.pr_number,
       coalesce(a.handle, m.observed_author_login)    as author_login,
       coalesce(b.handle, m.observed_merged_by_login) as merged_by_login,
       m.merged_at,
       m.sampled_at
  from signals.pull_request_merge m
  join signals.content_github_repo g on g.content_item_id = m.content_item_id
  left join signals.platform_account a on a.id = m.author_account_id
  left join signals.platform_account b on b.id = m.merged_by_account_id;

create or replace view compat.gh_contrib_weeks as
select g.repo_id,
       pa.handle as login,
       w.week_starting as week,
       w.commits
  from signals.repo_contribution_week w
  join signals.content_github_repo g on g.content_item_id = w.content_item_id
  join signals.platform_account pa on pa.id = w.platform_account_id;

-- The agent-vs-human weekly series. Legacy materialized this; here it reads
-- the canonical rows directly, and actor_class is an enum rather than text, so
-- a fourth spelling cannot silently appear and split a series in two.
create or replace view compat.v_gh_agent_weeks as
select w.week_starting as week,
       coalesce(d.actor_class::text, 'human') as actor_class,
       d.agent_vendor,
       count(distinct w.platform_account_id) as actors,
       count(distinct w.content_item_id) as repos,
       sum(w.commits) as commits
  from signals.repo_contribution_week w
  left join signals.github_account_detail d
         on d.platform_account_id = w.platform_account_id
 group by w.week_starting, coalesce(d.actor_class::text, 'human'), d.agent_vendor;

-- -------------------------------------------------------------------- runs
-- The counters are read back from job_run_metric, where a measurement of a run
-- belongs. params is left holding only the job's input arguments, which is what
-- the legacy column contained: {"repos": 55, "top_n": 10, ...} and nothing about
-- the outcome.
create or replace view compat.gh_sync_runs as
select ri.id,
       r.params ->> 'job' as job,
       r.status::text     as status,
       r.started_at,
       r.finished_at,
       max(m.value) filter (where m.metric_code = 'repos_total')::int
         as repos_total,
       max(m.value) filter (where m.metric_code = 'repos_ok')::int
         as repos_ok,
       max(m.value) filter (where m.metric_code = 'repos_failed')::int
         as repos_failed,
       r.api_calls,
       max(m.value) filter (where m.metric_code = 'rate_remaining')::int
         as rate_remaining,
       max(m.value) filter (where m.metric_code = 'stars_delta')::int
         as stars_delta,
       -- The job name is a canonical-model detail, not something the legacy
       -- params column carried, so it is stripped back out of the payload.
       (r.params - 'job') as params,
       r.summary,
       r.error
  from signals.job_run r
  join compat.gh_run_id ri on ri.job_run_id = r.id
  left join signals.job_run_metric m on m.job_run_id = r.id
 where r.kind = 'github_sync'
 group by ri.id, r.params, r.status, r.started_at, r.finished_at,
          r.api_calls, r.summary, r.error;

-- The legacy queue table. It is empty and the dashboard only reads it, so it
-- is presented as an empty set of the right shape rather than given a
-- canonical home it does not need.
create or replace view compat.gh_ingestion_requests as
select null::bigint      as id,
       null::text        as repo_url,
       null::text        as status,
       null::timestamptz as requested_at,
       null::timestamptz as started_at,
       null::timestamptz as finished_at,
       null::jsonb       as summary,
       null::text        as error
 where false;

commit;

-- ------------------------------------------------------------ metric series
--
-- The legacy daily table, rebuilt from the observations. One legacy row held
-- several counters measured together, so the pivot regroups them by
-- (repo, date) -- the grain the measurement actually has.
--
-- source is derived from the capture date rather than stored per observation:
-- the sheet baseline and the API capture are on different days, which is what
-- distinguished them in the first place.
create or replace view compat.gh_repo_metrics as
select g.repo_id,
       cm.observed_at::date as captured_on,
       min(cm.observed_at)  as captured_at,
       max(cm.value) filter (where cm.kind = 'star')::integer       as stars,
       max(cm.value) filter (where cm.kind = 'fork')::integer       as forks,
       max(cm.value) filter (where cm.kind = 'open_issue')::integer as open_issues,
       max(cm.value) filter (where cm.kind = 'watcher')::integer    as watchers,
       case when count(*) filter (where cm.kind = 'watcher') > 0
            then 'api' else 'sheet' end as source
  from public.content_metric cm
  join signals.content_github_repo g on g.content_item_id = cm.content_item_id
 where cm.kind in ('star', 'fork', 'open_issue', 'watcher')
 group by g.repo_id, cm.observed_at::date;
