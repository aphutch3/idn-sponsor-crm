-- 77_signals_curation.sql  (release canonical-v3-signals)
--
-- Curation, scoring, speaker prospecting, editorial Majors, operator config.
--
-- Recurring decisions in this file:
--   * Arrays of ids become child rows. x_clusters.tweet_ids was a text[] of
--     post ids with no referential integrity; membership is a relationship and
--     belongs in a table.
--   * Scores are OBSERVATIONS, not attributes. x_account_scores already
--     carries scored_at with 8,018 rows for ~4,000 accounts, i.e. it is
--     already a time series; this models it as one.
--   * Scraped prospect entities reference canonical public.person and
--     public.company by nullable link, never by creating stub canonical rows.

begin;

create type signals.speaker_archetype as enum ('strategist','architect','engineer');

-- ===========================================================================
-- X curation
-- ===========================================================================

create table signals.x_list (
  id                   uuid primary key default gen_random_uuid(),
  list_id              text not null unique,
  name                 text not null,
  description          text,
  owner_account_id     uuid references signals.platform_account(id) on delete set null,
  is_private           boolean not null default false,
  list_created_at      timestamptz,
  members_synced_at    timestamptz,
  timeline_synced_at   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger x_list_touch before update on signals.x_list
  for each row execute function public.tg_touch_updated_at();

comment on table signals.x_list is
  'Curated X list. Member and follower counts are observations and live in signals.account_metric-style history, not as columns here.';

create table signals.x_list_member (
  x_list_id           uuid not null references signals.x_list(id) on delete cascade,
  platform_account_id uuid not null references signals.platform_account(id) on delete cascade,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz,
  primary key (x_list_id, platform_account_id)
);

create index x_list_member_account_ix
  on signals.x_list_member (platform_account_id);

comment on table signals.x_list_member is
  'List membership as a relationship with its own first/last seen, replacing an id array.';

create table signals.x_bookmark (
  content_item_id uuid primary key
    references public.content_item(id) on delete cascade,
  position        integer,
  synced_at       timestamptz not null default now()
);

comment on table signals.x_bookmark is
  'Operator-bookmarked posts. Keyed by content_item so a bookmark cannot point at a post that was never ingested.';

-- ---------------------------------------------------------------------------
-- content_cluster : topic clusters over posts
-- ---------------------------------------------------------------------------
create table signals.content_cluster (
  id              uuid primary key default gen_random_uuid(),
  preset          text not null,
  label           text not null,
  summary         text,
  built_at        timestamptz not null default now(),
  top_engagement  bigint
);

create index content_cluster_preset_ix
  on signals.content_cluster (preset, built_at desc);

comment on table signals.content_cluster is
  'A generated topic cluster for a preset. Membership lives in signals.content_cluster_member; cluster size is derived from it rather than stored, so the two can never disagree.';

create table signals.content_cluster_member (
  content_cluster_id uuid not null
    references signals.content_cluster(id) on delete cascade,
  content_item_id    uuid not null
    references public.content_item(id) on delete cascade,
  rank               integer,
  primary key (content_cluster_id, content_item_id),
  constraint content_cluster_member_rank_ck check (rank is null or rank >= 1)
);

create index content_cluster_member_item_ix
  on signals.content_cluster_member (content_item_id);

comment on table signals.content_cluster_member is
  'Cluster membership as rows, replacing the source text[] of post ids which carried no referential integrity.';

-- ---------------------------------------------------------------------------
-- signal_capture : "this item matched this preset at this time"
-- ---------------------------------------------------------------------------
create table signals.signal_capture (
  preset          text not null,
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  fetched_at      timestamptz not null default now(),
  primary key (preset, content_item_id)
);

create index signal_capture_recent_ix
  on signals.signal_capture (preset, fetched_at desc);

comment on table signals.signal_capture is
  'Records that a content item satisfied a named signal preset.';

-- ---------------------------------------------------------------------------
-- account_score : append-only scoring history
-- ---------------------------------------------------------------------------
create table signals.account_score (
  id                  uuid primary key default gen_random_uuid(),
  platform_account_id uuid not null
    references signals.platform_account(id) on delete cascade,
  score               numeric(6,3) not null,
  reach               numeric(6,3),
  engagement          numeric(6,3),
  curation            numeric(6,3),
  cadence             numeric(6,3),
  -- The weights and inputs behind this score, retained so a historical score
  -- stays explainable after the scoring model changes.
  components          jsonb not null default '{}'::jsonb,
  scored_at           timestamptz not null default now(),
  model_version       text
);

create unique index account_score_grain_uk
  on signals.account_score (platform_account_id, scored_at);

-- "Current ranking" reads the newest score per account.
create index account_score_latest_ix
  on signals.account_score (platform_account_id, scored_at desc);

create index account_score_leaderboard_ix
  on signals.account_score (scored_at desc, score desc);

comment on table signals.account_score is
  'Append-only account scoring history. model_version and components keep an old score explainable after the model changes.';

create trigger account_score_no_update before update on signals.account_score
  for each row execute function signals.reject_account_metric_mutation();
create trigger account_score_no_delete before delete on signals.account_score
  for each row execute function signals.reject_account_metric_mutation();

-- ---------------------------------------------------------------------------
-- linkedin_engagement_observation
-- ---------------------------------------------------------------------------
create table signals.linkedin_engagement_observation (
  id                  uuid primary key default gen_random_uuid(),
  content_item_id     uuid references public.content_item(id) on delete cascade,
  platform_account_id uuid not null
    references signals.platform_account(id) on delete cascade,
  post_urn            text,
  posted_at           timestamptz,
  observed_at         timestamptz not null default now()
);

create index linkedin_engagement_account_ix
  on signals.linkedin_engagement_observation (platform_account_id, observed_at desc);

comment on table signals.linkedin_engagement_observation is
  'Observed engagement by a tracked profile on a post, used to detect activity for rotation banding.';

-- ===========================================================================
-- Speaker prospecting
-- ===========================================================================
-- Scraped conference data. The people and companies here are PROSPECTS, not
-- curated canonical records, so person_id/company_id stay nullable and are set
-- only when a prospect is confidently matched to the canonical spine.

create table signals.conference (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  edition      text,
  starts_on    date,
  ends_on      date,
  source_url   text,
  created_at   timestamptz not null default now(),
  constraint conference_dates_ck check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table signals.speaker_profile (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  title               text,
  bio                 text,
  person_id           uuid references public.person(id) on delete set null,
  company_id          uuid references public.company(id) on delete set null,
  company_raw         text,
  archetype           signals.speaker_archetype,
  influence_score     numeric(6,3),
  x_account_id        uuid references signals.platform_account(id) on delete set null,
  linkedin_account_id uuid references signals.platform_account(id) on delete set null,
  source_url          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint speaker_influence_ck
    check (influence_score is null or influence_score between 0 and 100)
);

create index speaker_profile_person_ix on signals.speaker_profile (person_id)
  where person_id is not null;
create index speaker_profile_company_ix on signals.speaker_profile (company_id)
  where company_id is not null;
create index speaker_profile_archetype_ix on signals.speaker_profile (archetype, influence_score desc)
  where archetype is not null;
create index speaker_profile_name_trgm_ix on signals.speaker_profile
  using gin (full_name public.gin_trgm_ops);

create trigger speaker_profile_touch before update on signals.speaker_profile
  for each row execute function public.tg_touch_updated_at();

comment on table signals.speaker_profile is
  'Scraped conference speaker prospect. person_id/company_id link to the canonical spine only once matched; NULL means unmatched, so prospecting never creates stub canonical records.';

create table signals.conference_session (
  id             uuid primary key default gen_random_uuid(),
  conference_id  uuid not null references signals.conference(id) on delete cascade,
  title          text not null,
  abstract       text,
  session_date   date,
  track          text,
  source_url     text
);

create index conference_session_conf_ix on signals.conference_session (conference_id);

create table signals.session_speaker (
  conference_session_id uuid not null
    references signals.conference_session(id) on delete cascade,
  speaker_profile_id    uuid not null
    references signals.speaker_profile(id) on delete cascade,
  speaker_role          text,
  primary key (conference_session_id, speaker_profile_id)
);

create index session_speaker_profile_ix on signals.session_speaker (speaker_profile_id);

comment on table signals.session_speaker is
  'Many-to-many session participation: a session can have several speakers and a speaker several sessions.';

create table signals.speaker_list (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table signals.speaker_list_member (
  speaker_list_id    uuid not null references signals.speaker_list(id) on delete cascade,
  speaker_profile_id uuid not null references signals.speaker_profile(id) on delete cascade,
  position           integer,
  note               text,
  added_at           timestamptz not null default now(),
  primary key (speaker_list_id, speaker_profile_id)
);

-- ===========================================================================
-- Editorial Majors
-- ===========================================================================

create table signals.major_publication (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  view_type     text not null default 'generic',
  content_source_id uuid references public.content_source(id) on delete set null,
  is_active     boolean not null default true,
  position      integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger major_publication_touch before update on signals.major_publication
  for each row execute function public.tg_touch_updated_at();

comment on table signals.major_publication is
  'A publication featured in The Majors. view_type selects the custom analysis panel; the standard article feed renders for every major regardless.';

create table signals.major_analysis (
  major_publication_id uuid not null
    references signals.major_publication(id) on delete cascade,
  kind                 text not null,
  payload              jsonb not null,
  generated_at         timestamptz not null default now(),
  model_version        text,
  primary key (major_publication_id, kind)
);

comment on table signals.major_analysis is
  'Generated analysis panel per (major, kind). Upsert grain: regenerating replaces the panel and never duplicates it.';

-- ===========================================================================
-- Operator config
-- ===========================================================================

create table signals.dropdown_option (
  id          uuid primary key default gen_random_uuid(),
  group_code  text not null,
  value       text not null,
  label       text not null,
  position    integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint dropdown_option_group_ck check (group_code ~ '^[a-z][a-z0-9_]*$')
);

create unique index dropdown_option_uk
  on signals.dropdown_option (group_code, value);

create index dropdown_option_active_ix
  on signals.dropdown_option (group_code, position)
  where is_active;

comment on table signals.dropdown_option is
  'Operator-editable select options, keyed by group. Unique per (group, value).';

commit;
