-- 72_platform_content.sql  (release canonical-v3-signals)
--
-- Platform-specific content detail, one-to-one with public.content_item.
--
-- canonical-v2-content established content_item as ONE grain for every kind of
-- content, and its content_kind enum already carries x_post, youtube_video,
-- github_repo and linkedin_post. This file completes that intent: an X post is
-- a content_item with an x-post detail row, exactly as a newsletter article is
-- a content_item with a content_newsletter_item row.
--
-- The shared fields (title, url, body_text, published_at, language, author,
-- importance_score, raw) stay on content_item. Only genuinely platform-specific
-- structure lands here. This is what lets "everything published in the last 24
-- hours, across every source" be one indexed query instead of a five-way union.
--
-- ENGAGEMENT COUNTS DO NOT LIVE HERE. Likes, stars, views and reposts are
-- observations at a time and belong in public.content_metric (append-only).
-- Storing them as columns would overwrite history on every re-sync.

begin;

-- ---------------------------------------------------------------------------
-- content_x_post
-- ---------------------------------------------------------------------------
create table signals.content_x_post (
  content_item_id     uuid primary key
    references public.content_item(id) on delete cascade,
  tweet_id            text not null unique,
  conversation_id     text,
  author_account_id   uuid references signals.platform_account(id) on delete set null,

  is_reply            boolean not null default false,
  is_quote            boolean not null default false,
  is_repost           boolean not null default false,

  -- Structured platform payloads. Kept as jsonb because their shape is the
  -- platform's to change, not ours; promoted to rows in public.content_entity
  -- when a mention resolves to a known person or company.
  entities            jsonb not null default '{}'::jsonb,
  referenced          jsonb not null default '{}'::jsonb,

  synced_at           timestamptz
);

create index content_x_post_conversation_ix
  on signals.content_x_post (conversation_id)
  where conversation_id is not null;

create index content_x_post_author_ix
  on signals.content_x_post (author_account_id)
  where author_account_id is not null;

-- Original posts only: the default Signals reading view excludes replies and
-- reposts, and this partial index keeps that filter from scanning the table.
create index content_x_post_original_ix
  on signals.content_x_post (content_item_id)
  where not is_reply and not is_repost;

comment on table signals.content_x_post is
  'X-specific detail for a content_item of kind x_post. Engagement counts live in public.content_metric, not here.';

-- ---------------------------------------------------------------------------
-- content_youtube_video
-- ---------------------------------------------------------------------------
create table signals.content_youtube_video (
  content_item_id     uuid primary key
    references public.content_item(id) on delete cascade,
  video_id            text not null unique,
  channel_account_id  uuid references signals.platform_account(id) on delete set null,

  duration_seconds    integer,
  is_short            boolean not null default false,
  thumbnail_url       text,

  -- The platform reports some upload times only as display text ("3 weeks
  -- ago"). published_at on content_item holds the best available instant;
  -- these two retain the provenance of that estimate so a derived date is
  -- never mistaken for a reported one.
  published_text      text,
  is_published_estimated boolean not null default false,

  ingest_depth        integer,
  ingested_at         timestamptz,

  constraint content_youtube_duration_ck
    check (duration_seconds is null or duration_seconds >= 0)
);

create index content_youtube_channel_ix
  on signals.content_youtube_video (channel_account_id)
  where channel_account_id is not null;

-- Long-form vs Shorts are browsed separately in The Signals.
create index content_youtube_longform_ix
  on signals.content_youtube_video (content_item_id)
  where not is_short;

comment on table signals.content_youtube_video is
  'YouTube-specific detail for a content_item of kind youtube_video. is_published_estimated records that published_at was derived from relative display text rather than reported directly.';

-- ---------------------------------------------------------------------------
-- content_github_repo
-- ---------------------------------------------------------------------------
create table signals.content_github_repo (
  content_item_id     uuid primary key
    references public.content_item(id) on delete cascade,
  repo_id             text not null unique,
  owner_login         text not null,
  repo_name           text not null,
  owner_account_id    uuid references signals.platform_account(id) on delete set null,
  company_id          uuid references public.company(id) on delete set null,

  primary_language    text,
  license             text,
  homepage            text,
  size_kb             integer,

  is_archived         boolean not null default false,
  is_monitored        boolean not null default true,

  repo_created_at     timestamptz,
  pushed_at           timestamptz,
  last_release_at     timestamptz,
  metrics_fetched_at  timestamptz,

  constraint content_github_repo_nwo_uk unique (owner_login, repo_name)
);

create index content_github_owner_ix
  on signals.content_github_repo (owner_account_id)
  where owner_account_id is not null;

create index content_github_company_ix
  on signals.content_github_repo (company_id)
  where company_id is not null;

create index content_github_language_ix
  on signals.content_github_repo (primary_language)
  where primary_language is not null;

-- The active landscape view excludes archived repos.
create index content_github_active_ix
  on signals.content_github_repo (pushed_at desc)
  where is_monitored and not is_archived;

comment on table signals.content_github_repo is
  'GitHub-specific detail for a content_item of kind github_repo. Star/fork/issue counts are observations and live in public.content_metric. Repo topics become public.content_entity rows, not a text array.';

-- ---------------------------------------------------------------------------
-- content_linkedin_post
-- ---------------------------------------------------------------------------
create table signals.content_linkedin_post (
  content_item_id     uuid primary key
    references public.content_item(id) on delete cascade,
  post_urn            text not null unique,
  author_account_id   uuid references signals.platform_account(id) on delete set null,

  is_repost           boolean not null default false,
  is_quote            boolean not null default false,

  ingested_at         timestamptz
);

create index content_linkedin_author_ix
  on signals.content_linkedin_post (author_account_id)
  where author_account_id is not null;

comment on table signals.content_linkedin_post is
  'LinkedIn-specific detail for a content_item of kind linkedin_post. Supersedes the ungoverned public.linkedin_post table, which is retired in a separate release.';

commit;
