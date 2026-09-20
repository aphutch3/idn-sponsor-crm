-- 70_platform_accounts.sql  (release canonical-v3-signals)
--
-- Observed platform accounts: X, GitHub, YouTube, LinkedIn.
--
-- WHY THIS IS NOT public.person_handle
-- ------------------------------------
-- public.person_handle.person_id is NOT NULL: a handle there is an assertion
-- that a known, curated human owns it. The Signals app observes ~11,000
-- accounts (4,018 X, 6,621 GitHub, 452 LinkedIn, 50 YouTube) of which only a
-- small minority resolve to a real person. Writing those into person_handle
-- would require inventing ~11,000 stub person rows next to the 3,903 curated
-- ones, which destroys the meaning of public.person and is exactly the
-- duplicate-people outcome the canonical model exists to prevent.
--
-- So an observed account is a first-class row HERE, in the app-private schema,
-- and carries two nullable upward links:
--
--   person_id         -- set once a human is confidently identified
--   person_handle_id  -- set once that identity is promoted to the canonical
--                        spine; this row then mirrors a canonical handle
--
-- NULL in either column means "not yet resolved", never "no person exists".
-- That is the same null_meaning discipline used for content_item.author_person_id
-- in canonical-v2-content, and it is recorded in meta.column_annotation.
--
-- Promotion to public.person_handle is a deliberate, reviewed act. The Signals
-- app holds `propose`, not `write`, on canonical identity.

begin;

-- ---------------------------------------------------------------------------
-- platform_account
-- ---------------------------------------------------------------------------
-- One row per observed account per platform. Grain: (platform, handle).
--
-- Two distinct uniqueness rules, because the two identifiers behave
-- differently:
--   * (platform, platform_account_id) is the STABLE identity. X user ids and
--     GitHub node ids survive renames.
--   * (platform, normalized_handle) is the DISPLAY identity and can be
--     recycled by the platform after an account is deleted.
-- Both are enforced; a rename updates the handle while the id holds the row
-- steady, which is what keeps content attribution from silently reattaching
-- to a different human after a username is released and re-registered.

create table signals.platform_account (
  id                  uuid primary key default gen_random_uuid(),
  platform            text not null,
  handle              text not null,
  normalized_handle   text not null,
  platform_account_id text,

  display_name        text,
  description         text,
  url                 text,
  avatar_url          text,
  location            text,
  is_verified         boolean,
  account_created_at  timestamptz,

  person_id           uuid references public.person(id) on delete set null,
  person_handle_id    uuid references public.person_handle(id) on delete set null,

  first_seen_at       timestamptz not null default now(),
  last_synced_at      timestamptz,
  is_monitored        boolean not null default false,

  source_system       text references public.source_system(code),
  raw                 jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint platform_account_platform_ck
    check (platform in ('x','github','youtube','linkedin')),
  constraint platform_account_handle_ck
    check (length(btrim(handle)) > 0)
);

-- Display identity. Recyclable by the platform, so not the stable key.
create unique index platform_account_platform_handle_uk
  on signals.platform_account (platform, normalized_handle);

-- Stable identity. Partial: not every observed account has been resolved to a
-- platform-side id yet (a handle scraped from a mention, for example).
create unique index platform_account_platform_id_uk
  on signals.platform_account (platform, platform_account_id)
  where platform_account_id is not null;

create index platform_account_person_ix
  on signals.platform_account (person_id)
  where person_id is not null;

-- Powers "which accounts still need a human?" review queues.
create index platform_account_unresolved_ix
  on signals.platform_account (platform, last_synced_at desc)
  where person_id is null;

create index platform_account_monitored_ix
  on signals.platform_account (platform)
  where is_monitored;

comment on table signals.platform_account is
  'Observed social/code platform account. App-private: person_id and person_handle_id are NULL until the account is resolved to a curated human, so canonical public.person is never polluted with stub rows.';

-- ---------------------------------------------------------------------------
-- Per-platform detail, one-to-one.
-- ---------------------------------------------------------------------------
-- Platform-specific attributes live in their own table rather than as nullable
-- columns on platform_account. A GitHub account has no "is_protected"; an X
-- account has no "primary_language". Nullable columns would make the account
-- table a union of four platforms where most columns are meaningless for any
-- given row, and an agent reading the schema could not tell which columns
-- apply. One-to-one tables make applicability structural.

create table signals.x_account_detail (
  platform_account_id uuid primary key
    references signals.platform_account(id) on delete cascade,
  is_following        boolean not null default false,
  listed_count        integer,
  categories          text[],
  profile_synced_at   timestamptz
);
comment on table signals.x_account_detail is
  'X-specific account attributes. One-to-one with signals.platform_account where platform = x.';

create table signals.github_account_detail (
  platform_account_id uuid primary key
    references signals.platform_account(id) on delete cascade,
  account_type        text,
  actor_class         text,
  agent_vendor        text,
  company_raw         text,
  company_norm        text,
  company_id          uuid references public.company(id) on delete set null,
  email               text,
  blog                text,
  public_repos        integer,
  profile_fetched_at  timestamptz,
  constraint github_account_type_ck
    check (account_type is null or account_type in ('User','Organization','Bot'))
);
comment on table signals.github_account_detail is
  'GitHub-specific account attributes. company_id links to canonical public.company once the free-text employer is resolved; NULL means unresolved, not unemployed.';

create table signals.youtube_channel_detail (
  platform_account_id uuid primary key
    references signals.platform_account(id) on delete cascade,
  playlist_id         text,
  beat                text,
  list_name           text,
  source_kind         text,
  note                text,
  last_video_at       timestamptz,
  first_ingested_at   timestamptz,
  last_ingested_at    timestamptz
);
comment on table signals.youtube_channel_detail is
  'YouTube-specific channel attributes, including the editorial beat used to group channels in The Signals.';

create table signals.linkedin_account_detail (
  platform_account_id uuid primary key
    references signals.platform_account(id) on delete cascade,
  slug                text,
  headline            text,
  band                text,
  score               numeric,
  url_type            text,
  source              text,
  is_pinned           boolean not null default false,
  is_probation        boolean not null default false,
  is_self_confirmed   boolean not null default false,
  cooldown_until      timestamptz,
  last_swept_at       timestamptz,
  last_authored_at    timestamptz,
  notes               text
);
comment on table signals.linkedin_account_detail is
  'LinkedIn-specific account attributes including the rotation band and cooldown that govern sweep scheduling.';

-- ---------------------------------------------------------------------------
-- account_metric  (append-only)
-- ---------------------------------------------------------------------------
-- Follower counts, subscriber counts, repo counts and the like are
-- OBSERVATIONS AT A TIME, not attributes of the account. Storing them as
-- columns on platform_account would silently destroy history on every sync and
-- make "did this account grow after we featured it?" unanswerable.
--
-- Mirrors public.content_metric from canonical-v2-content: same enum, same
-- append-only guarantee, same grain shape.

create table signals.account_metric (
  id                  uuid primary key default gen_random_uuid(),
  platform_account_id uuid not null
    references signals.platform_account(id) on delete cascade,
  kind                public.content_metric_kind not null,
  value               bigint not null,
  observed_at         timestamptz not null default now(),
  source_system       text references public.source_system(code)
);

-- One observation per account/kind/instant. A re-sync that reports the same
-- value at the same instant is a duplicate, not a new fact.
create unique index account_metric_grain_uk
  on signals.account_metric (platform_account_id, kind, observed_at);

-- Latest-value and time-series reads.
create index account_metric_lookup_ix
  on signals.account_metric (platform_account_id, kind, observed_at desc);

comment on table signals.account_metric is
  'Append-only time series of account-level counts (followers, subscribers, repos). Never updated in place; each sync appends an observation.';

commit;
