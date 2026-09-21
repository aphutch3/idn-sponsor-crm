-- 114_github_fixes.sql
--
-- Closes the gaps between the canonical GitHub tables (designed in an earlier
-- phase, still empty) and what the legacy GitHub domain actually records.
--
-- Four things had no canonical home.

begin;

-- ------------------------------------------------------------ 1. actor class
--
-- github_account_detail.actor_class and account_type were free text. This
-- dataset exists to measure how much of the world's code is now written by
-- coding agents rather than people, so the distinction between a human, a CI
-- bot, and a coding agent is the primary axis of every question asked of it --
-- not an incidental label. Free text lets a typo silently become a fourth
-- class and quietly drop rows out of every agent-vs-human comparison.
--
-- The three values are the ones the legacy data actually carries
-- (human 6,344 · ci_bot 260 · coding_agent 17).

create type signals.github_actor_class as enum ('human', 'ci_bot', 'coding_agent');
create type signals.github_account_type as enum ('user', 'organization', 'bot');

-- The existing check spelled the values in GitHub's own casing
-- ('User'/'Organization'/'Bot') while the data that has to load into it is
-- lowercase. Rather than keep two spellings of the same fact, the enum is
-- lowercase like every other enum in this schema and the loader maps the
-- vendor's casing on the way in.
alter table signals.github_account_detail
  drop constraint if exists github_account_type_ck;

alter table signals.github_account_detail
  alter column actor_class drop default,
  alter column actor_class type signals.github_actor_class
    using coalesce(actor_class, 'human')::signals.github_actor_class,
  alter column actor_class set not null,
  alter column actor_class set default 'human',
  alter column account_type type signals.github_account_type
    using nullif(lower(account_type), '')::signals.github_account_type;

-- agent_vendor is only meaningful for a non-human actor: a human with a vendor
-- is a contradiction, and a coding agent whose vendor is unknown is a real
-- state (16 distinct vendors across 17 agents, so the field is near-unique and
-- worth protecting).
alter table signals.github_account_detail
  add constraint github_agent_vendor_ck
  check (agent_vendor is null or actor_class <> 'human');

-- --------------------------------------------------------- 2. repo taxonomy
--
-- Every repo is filed under macro_category > group > subcategory, with one of
-- them flagged primary. That is the spine of the landscape view and it had no
-- table. It is deliberately NOT the editorial tag system: these are a curated
-- three-level taxonomy with a designated primary, whereas signals.tag is a
-- flat vocabulary with aliases and merge suggestions. Forcing them together
-- would lose the levels and the primary flag.

create table signals.repo_category (
  content_item_id uuid    not null references public.content_item(id) on delete cascade,
  macro_category  text    not null,
  group_name      text    not null,
  subcategory     text    not null,
  is_primary      boolean not null default false,
  primary key (content_item_id, macro_category, group_name, subcategory)
);

-- A repo has at most one primary category. The legacy table had no such
-- constraint and the ranked view silently resolved ties by row id, which means
-- a reload could have changed which category a repo appeared under.
create unique index repo_category_one_primary
  on signals.repo_category (content_item_id) where is_primary;

create index repo_category_macro_idx
  on signals.repo_category (macro_category, group_name, subcategory);

comment on table signals.repo_category is
  'Curated three-level taxonomy for a repository. Separate from signals.tag, which is a flat editorial vocabulary.';

-- ------------------------------------------------------------- 3. baselines
--
-- stars_delta -- the headline number on the momentum view -- is
-- stars - baseline_stars, so the baseline is not a stale copy of a metric: it
-- is the fixed reference point the delta is measured FROM, captured on a
-- specific date. It belongs with the repo, not in the metric series, because
-- it is chosen once rather than observed daily.

alter table signals.content_github_repo
  add column baseline_stars  integer,
  add column baseline_forks  integer,
  add column baseline_issues integer,
  add column baseline_as_of  date;

alter table signals.content_github_repo
  add constraint github_repo_baseline_ck
  check ((baseline_as_of is null) = (baseline_stars is null));

comment on column signals.content_github_repo.baseline_as_of is
  'The date the baseline was taken. stars_delta is measured from this point, so a baseline without a date cannot be interpreted.';

-- ---------------------------------------------------- 4. sampled PR identity
--
-- pull_request_merge records the author and merger as account references, but
-- the sample often names a login we never profiled. Keeping the observed login
-- alongside the reference preserves the evidence when the reference is null --
-- the same lesson LinkedIn taught with observed_author_name.

alter table signals.pull_request_merge
  add column observed_author_login    text,
  add column observed_merged_by_login text;

alter table signals.pull_request_merge
  add constraint pr_merge_pr_number_ck check (pr_number > 0);

commit;

-- ------------------------------------------------------- 5. observed X handle
--
-- gh_people carries BOTH a twitter_username scraped from the GitHub profile and
-- an x_username/x_user_id pair produced by a matching pass that records which
-- method matched. Those are different claims of different strength and the
-- match method is the evidence for the stronger one, so all four are kept.
--
-- They are deliberately NOT resolved to the canonical X account here. Only 3 of
-- 6,621 people have an x_user_id, and linking an account on a self-reported
-- handle is entity resolution: it needs evidence per match and it is how two
-- real people get silently merged into one. The text is the observation; the
-- link is a later, reviewable decision -- the same treatment
-- linkedin_account_detail.x_handle gets.

begin;

alter table signals.github_account_detail
  add column twitter_username text,
  add column x_username       text,
  add column x_user_id        text,
  add column x_match_method   text,
  add column x_matched_at     timestamptz;

alter table signals.github_account_detail
  add constraint github_x_match_evidence_ck
  check (x_match_method is null or x_user_id is not null or x_username is not null);

comment on column signals.github_account_detail.x_match_method is
  'How the X account was matched. Present only with a match, because a method without a result is not evidence of anything.';

commit;

-- -------------------------------------------------- 6. the owning company
--
-- gh_repos carries company_owner and company_domain on all 279 repos, and on
-- 267 of them the company is NOT the GitHub owner ('vercel' the org versus
-- Vercel the company, and many repos live under a foundation or a personal
-- account). The owners view groups by it, so it is load-bearing: grouping by
-- the GitHub owner instead gives 246 groups where the real answer is 213.
--
-- A company is a first-class canonical object shared by every app in this
-- database, so the repo references public.company rather than carrying the
-- company's name and domain as its own columns -- that is the duplication this
-- migration exists to remove.
--
-- But the resolution is by DOMAIN, and a matched company's canonical name is
-- not always the string this dataset used. So the observed pair is kept as
-- evidence beside the reference, the same way LinkedIn keeps the author name
-- the sweep observed: the reference is the identity, the observation is what
-- this source actually said.

begin;

alter table signals.content_github_repo
  add column observed_company_owner  text,
  add column observed_company_domain text;

create index content_github_repo_company_idx
  on signals.content_github_repo (company_id) where company_id is not null;

comment on column signals.content_github_repo.observed_company_owner is
  'The company name this source recorded. Kept beside company_id because a domain match can resolve to a canonical name spelled differently.';

commit;
