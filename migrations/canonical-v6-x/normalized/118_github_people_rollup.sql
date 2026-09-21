-- 118_github_people_rollup.sql
--
-- Stores the six per-person counters gh_people carries, instead of deriving
-- them from the contributor edges.
--
-- I built the compat layer deriving them, on the reasoning that a counter which
-- is also derivable from its inputs is a duplicate fact free to disagree. That
-- reasoning was right in general and WRONG here, and the data said so:
--
--   sum(gh_people.commits_90d)                     = 285,605
--   sum(gh_repo_contributors.commits_90d)          = 282,646
--
-- The 2,959 gap is exactly 260 people who have counters but NO contributor rows
-- at all. Per person, where edges exist, the stored and derived values agree on
-- every single row -- 0 disagreements out of 6,621 -- so this is not drift. The
-- contributor edges for those 260 were pruned by a later re-sync that narrowed
-- which repos get contributor detail (run 15 rebuilt only 10 repos and lost
-- every edge it did not rebuild).
--
-- So the counter is not a redundant rollup of the current edges. It is a
-- MEASUREMENT taken when the edges existed, and the edges are a sample that has
-- since been narrowed. Deriving it would silently report 0 commits for 260
-- real contributors and quietly delete 12,927 commits and 26.7M reach-stars
-- from the record. A derived value is only equivalent to a stored one while all
-- its inputs are still present.
--
-- computed_at is what makes the stored value honest: it says when the numbers
-- were true, rather than presenting a stale rollup as current.

begin;

alter table signals.github_account_detail
  add column repos_count       integer,
  add column repos_top10_count integer,
  add column commits_total     integer,
  add column commits_90d       integer,
  add column merges_observed   integer,
  add column reach_stars       bigint,
  add column rollup_computed_at timestamptz;

alter table signals.github_account_detail
  add constraint github_rollup_nonneg_ck
  check (
    coalesce(repos_count, 0)       >= 0 and
    coalesce(repos_top10_count, 0) >= 0 and
    coalesce(commits_total, 0)     >= 0 and
    coalesce(commits_90d, 0)       >= 0 and
    coalesce(merges_observed, 0)   >= 0 and
    coalesce(reach_stars, 0)       >= 0
  );

-- top10 is a subset of the repos counted, so it can never exceed them. This is
-- the kind of contradiction a stored rollup can develop and a derived one
-- cannot, which is why storing it comes with a constraint.
alter table signals.github_account_detail
  add constraint github_rollup_top10_subset_ck
  check (repos_top10_count is null or repos_count is null
         or repos_top10_count <= repos_count);

comment on column signals.github_account_detail.rollup_computed_at is
  'When these counters were computed. They are a measurement, not a live rollup: the contributor edges some were computed from have since been pruned.';

commit;
