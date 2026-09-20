-- 75_github_graph.sql  (release canonical-v3-signals)
--
-- Contributor activity graph.
--
-- The source stores gh_contrib_weeks (768,204 rows) as
-- (id uuid, login text, repo_id text, commits int, week date) with no foreign
-- key to either the person or the repo. Three problems, all fixed here:
--
--   1. `login` as free text means a renamed GitHub account silently splits
--      into two contributors and nothing detects it.
--   2. A surrogate uuid primary key on a pure fact table costs 16 bytes per
--      row (~12 MB here) and indexes nothing anyone queries. The natural key
--      (account, repo, week) is the real identity and also the access path.
--   3. Nothing prevents a week row for a repo that is not tracked.
--
-- Replacing login/repo_id text with uuid foreign keys makes the rename problem
-- structurally impossible and makes every contributor query a join on an
-- indexed key rather than a string match.

begin;

-- ---------------------------------------------------------------------------
-- repo_contribution_week : the fact grain
-- ---------------------------------------------------------------------------
create table signals.repo_contribution_week (
  content_item_id     uuid not null
    references public.content_item(id) on delete cascade,
  platform_account_id uuid not null
    references signals.platform_account(id) on delete cascade,
  week_starting       date not null,
  commits             integer not null,

  primary key (content_item_id, platform_account_id, week_starting),

  constraint repo_contribution_week_commits_ck check (commits >= 0),
  -- GitHub weekly buckets always start on Sunday. A row on any other day means
  -- the upstream bucket boundary changed or the value was mis-derived.
  constraint repo_contribution_week_aligned_ck
    check (extract(dow from week_starting) = 0)
);

-- "What has this person contributed to, most recently?" — the contributor
-- profile page. Leads with account because the PK already serves repo-first.
create index repo_contribution_week_account_ix
  on signals.repo_contribution_week (platform_account_id, week_starting desc);

-- Time-series rollups across all repos for a given period.
create index repo_contribution_week_period_ix
  on signals.repo_contribution_week (week_starting desc);

comment on table signals.repo_contribution_week is
  'Commits by one account to one repo in one ISO week. Natural-key PK (repo, account, week) replaces a surrogate uuid: the key is the access path, and uuid foreign keys replace free-text logins so an account rename cannot split a contributor.';

-- ---------------------------------------------------------------------------
-- repo_contributor : the derived rollup
-- ---------------------------------------------------------------------------
-- Every column here is DERIVABLE from repo_contribution_week. It is kept as a
-- table, not a view, because the contributor leaderboard is read on every page
-- load and aggregating 768k rows per request is not viable at 0.25 CU.
--
-- That makes this a cache with a real risk: it can silently disagree with the
-- grain. So every derived column is annotated is_derived = true in
-- meta.column_annotation, and computed_at records when the rollup was last
-- rebuilt. A consumer that cannot tolerate staleness reads the grain.
create table signals.repo_contributor (
  content_item_id     uuid not null
    references public.content_item(id) on delete cascade,
  platform_account_id uuid not null
    references signals.platform_account(id) on delete cascade,

  commits_total       integer not null default 0,
  commits_365d        integer not null default 0,
  commits_90d         integer not null default 0,
  weeks_active        integer not null default 0,
  first_commit_week   date,
  last_commit_week    date,

  share_total         numeric(6,5),
  share_90d           numeric(6,5),
  rank_commits        integer,
  is_top10            boolean not null default false,
  importance          numeric,

  prs_authored        integer,
  prs_merged          integer,
  merges_performed    integer,

  computed_at         timestamptz not null default now(),

  primary key (content_item_id, platform_account_id),

  constraint repo_contributor_counts_ck check (
    commits_total >= 0 and commits_365d >= 0 and commits_90d >= 0
    and weeks_active >= 0
    -- Windowed counts are subsets of the total and of each other.
    and commits_365d <= commits_total
    and commits_90d  <= commits_365d
  ),
  constraint repo_contributor_share_ck check (
    (share_total is null or share_total between 0 and 1) and
    (share_90d   is null or share_90d   between 0 and 1)
  ),
  constraint repo_contributor_window_ck check (
    first_commit_week is null or last_commit_week is null
    or first_commit_week <= last_commit_week
  ),
  constraint repo_contributor_rank_ck check (rank_commits is null or rank_commits >= 1)
);

-- The leaderboard: top contributors for a repo.
create index repo_contributor_rank_ix
  on signals.repo_contributor (content_item_id, rank_commits)
  where rank_commits is not null;

-- The reverse view: which repos does this account matter to?
create index repo_contributor_account_ix
  on signals.repo_contributor (platform_account_id, commits_total desc);

-- The "core maintainers" filter used across the Signals GitHub workspace.
create index repo_contributor_top_ix
  on signals.repo_contributor (content_item_id)
  where is_top10;

comment on table signals.repo_contributor is
  'Derived per-(repo, account) rollup of signals.repo_contribution_week. Materialized for read performance at 0.25 CU; every measure column is annotated is_derived and computed_at records the rebuild time.';

-- ---------------------------------------------------------------------------
-- pull_request_merge : authority evidence
-- ---------------------------------------------------------------------------
-- Who merges whose pull requests is the evidence behind the "authority"
-- signal. Author and merger are two separate account references to the same
-- table, which is exactly why they must be typed as accounts rather than
-- logins: the pair is the fact.
create table signals.pull_request_merge (
  content_item_id     uuid not null
    references public.content_item(id) on delete cascade,
  pr_number           integer not null,
  author_account_id   uuid references signals.platform_account(id) on delete set null,
  merged_by_account_id uuid references signals.platform_account(id) on delete set null,
  merged_at           timestamptz,
  sampled_at          timestamptz not null default now(),

  primary key (content_item_id, pr_number),
  constraint pull_request_merge_number_ck check (pr_number >= 1)
);

create index pull_request_merge_merger_ix
  on signals.pull_request_merge (merged_by_account_id, merged_at desc)
  where merged_by_account_id is not null;

create index pull_request_merge_author_ix
  on signals.pull_request_merge (author_account_id, merged_at desc)
  where author_account_id is not null;

comment on table signals.pull_request_merge is
  'Sampled pull request author/merger pairs, the evidence behind the GitHub authority signal. Natural key (repo, pr_number).';

commit;
