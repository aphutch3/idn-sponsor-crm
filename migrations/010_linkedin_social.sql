-- 010_linkedin_social.sql
-- Phase 1 · Step 1.4 · Migration 10 of N (DDL)
-- LinkedIn & social monitoring domain + list_binding polymorphic hook.
--
-- Locked decisions this migration enforces:
--   D5-A: LinkedIn monitoring is a first-class canonical domain, not staging leftovers.
--   The `raw` jsonb column on posts + snapshots preserves the original source payload for
--     evidence / rescoring / model upgrades without a re-fetch.
--
-- Design notes:
--   - linkedin_topic_tag is PK'd on slug (matches source; small vocabulary; slug is human ID).
--   - linkedin_post identity: canonical uuid PK, plus unique(post_urn) — the LinkedIn activity URN is
--     the natural stable key we get from the platform. Also unique(post_url) for fallback.
--   - linkedin_snapshot has no natural unique key beyond (source_url, fetched_at) but we don't
--     enforce it — the same URL is refetched intentionally on a cadence to track drift via
--     content_hash. Query patterns are (entity_type, entity_id, fetched_at desc).
--   - list_binding is polymorphic: a `list` can be bound to a monitor config, a campaign, an
--     enrichment job, etc. binding_type identifies the flavor; binding_ref_id is the FK to
--     whichever table (soft FK — enforced by monitor_config.list_binding_id reverse).
--   - social_mention.id: uuid PK. Natural key from source (X post id, etc.) lives in
--     platform_post_id text with unique(platform, platform_post_id) for idempotent upsert.
--   - Timestamps: fetched_at / posted_at / first_seen_at / scored_at all timestamptz.
--
-- Runs on Neon canonical main after 001-009. No data motion in this migration.

-- ---------- list_binding ----------
-- Polymorphic binding: a list "does something" via a binding_type (e.g. drives a linkedin_monitor_config).
-- Kept separate from list_member (which is content) — bindings are behavior.
create table if not exists list_binding (
  id                    uuid primary key default gen_random_uuid(),
  list_id               uuid not null references list(id) on delete cascade,
  binding_type          text not null,                       -- 'linkedin_monitor' / 'campaign' / 'enrichment' / ...
  binding_ref_id        uuid,                                -- soft FK to whatever binding_type dictates
  active                bool not null default true,
  honor_suppressions    bool not null default true,
  suppression_list_ids  uuid[] not null default '{}',
  config                jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists list_binding_list_idx        on list_binding (list_id);
create index if not exists list_binding_type_active_idx on list_binding (binding_type, active);

-- ---------- linkedin_topic_tag ----------
-- Topic vocabulary the scorer matches against. Slug is the human ID.
create table if not exists linkedin_topic_tag (
  slug              text primary key,
  name              text not null,
  category          text,
  description       text,
  keyword_phrases   text[] not null default '{}',
  aliases           text[] not null default '{}',
  weight            int  not null default 1,
  active            bool not null default true,
  articles_30d      int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists linkedin_topic_tag_active_idx on linkedin_topic_tag (active) where active;
create index if not exists linkedin_topic_tag_category_idx on linkedin_topic_tag (category) where category is not null;

-- ---------- linkedin_monitor_config ----------
-- One config = one recurring LinkedIn watch job. Bound to a list (via list_binding_id →
-- list_binding.id) so the operator can point one job at any list of companies or people.
create table if not exists linkedin_monitor_config (
  id                    uuid primary key default gen_random_uuid(),
  list_binding_id       uuid references list_binding(id) on delete set null,
  name                  text not null,
  active                bool not null default true,
  fetch_types           text[] not null default '{}',        -- 'company_page' / 'company_posts' / 'person_page' / ...
  batch_size            int  not null default 5,
  cadence_seconds       int  not null default 21600,          -- 6h default
  jitter_seconds        int  not null default 1800,
  per_fetch_delay_ms    int  not null default 60000,
  score_posts           bool not null default true,
  topic_filter          text[] not null default '{}',
  relevance_min_score   int  not null default 60,
  run_cursor            jsonb not null default '{}'::jsonb,
  last_run_at           timestamptz,
  next_run_at           timestamptz,
  meta                  jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists linkedin_monitor_config_active_next_idx
  on linkedin_monitor_config (active, next_run_at) where active;
create index if not exists linkedin_monitor_config_binding_idx
  on linkedin_monitor_config (list_binding_id) where list_binding_id is not null;

-- ---------- linkedin_post ----------
-- One row per observed LinkedIn post attributed to a monitored entity (company or person).
-- entity_type = 'company' | 'person' | 'other'. entity_id is soft FK — kept text-poly to allow
-- fast triage before the entity is fully resolved.
create table if not exists linkedin_post (
  id                    uuid primary key default gen_random_uuid(),
  monitor_config_id     uuid references linkedin_monitor_config(id) on delete set null,
  entity_type           text not null,                       -- 'company' / 'person'
  entity_id             uuid not null,                       -- soft FK to company.id or person.id
  post_urn              text,                                -- e.g. urn:li:activity:7503240815213731840
  post_url              text,
  post_text             text,
  posted_at             timestamptz,
  media_kind            text,                                -- 'text' / 'image' / 'video' / 'article' / ...
  reactions             int not null default 0,
  comments              int not null default 0,
  reposts               int not null default 0,
  keyword_hits          text[] not null default '{}',
  relevance_score       int,
  relevance_reason      text,
  relevance_topics      text[] not null default '{}',
  scorer_model          text,
  scored_at             timestamptz,
  first_seen_at         timestamptz not null default now(),
  last_fetched_at       timestamptz,
  raw                   jsonb not null default '{}'::jsonb,
  meta                  jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);
create unique index if not exists linkedin_post_urn_uidx on linkedin_post (post_urn) where post_urn is not null;
create unique index if not exists linkedin_post_url_uidx on linkedin_post (post_url) where post_url is not null and post_urn is null;
create index if not exists linkedin_post_entity_time_idx on linkedin_post (entity_type, entity_id, posted_at desc);
create index if not exists linkedin_post_monitor_time_idx on linkedin_post (monitor_config_id, posted_at desc) where monitor_config_id is not null;
create index if not exists linkedin_post_relevance_idx on linkedin_post (relevance_score desc, posted_at desc) where relevance_score is not null;
create index if not exists linkedin_post_keyword_hits_gin on linkedin_post using gin (keyword_hits);
create index if not exists linkedin_post_relevance_topics_gin on linkedin_post using gin (relevance_topics);

-- ---------- linkedin_snapshot ----------
-- One row per fetch of a LinkedIn page (company_page, company_posts, person_page). Same URL is
-- refetched intentionally on cadence; content_hash detects drift.
create table if not exists linkedin_snapshot (
  id                    uuid primary key default gen_random_uuid(),
  monitor_config_id     uuid references linkedin_monitor_config(id) on delete set null,
  entity_type           text not null,
  entity_id             uuid not null,
  fetch_type            text not null,                        -- 'company_page' / 'company_posts' / 'person_page'
  source_url            text not null,
  http_status           int,
  content_hash          text,
  parsed                jsonb not null default '{}'::jsonb,
  raw_storage_path      text,                                 -- S3 / bucket key for the raw HTML if kept
  firecrawl_job_id      text,
  error                 text,
  fetched_at            timestamptz not null default now(),
  meta                  jsonb not null default '{}'::jsonb
);
create index if not exists linkedin_snapshot_entity_time_idx  on linkedin_snapshot (entity_type, entity_id, fetched_at desc);
create index if not exists linkedin_snapshot_monitor_time_idx on linkedin_snapshot (monitor_config_id, fetched_at desc) where monitor_config_id is not null;
create index if not exists linkedin_snapshot_hash_idx         on linkedin_snapshot (content_hash) where content_hash is not null;

-- ---------- social_mention ----------
-- Cross-platform social observation (X / LinkedIn / Reddit / etc.) matched via a query.
-- The Engager cron [42238cc4] writes here on a 6h cadence.
create table if not exists social_mention (
  id                    uuid primary key default gen_random_uuid(),
  platform              text not null,                        -- 'X' / 'LinkedIn' / 'Reddit' / ...
  platform_post_id      text not null,                        -- native ID from the platform
  topic                 text,
  query                 text,
  url                   text,
  text                  text,
  author_name           text,
  author_username       text,
  author_verified       bool,
  posted_at             timestamptz,
  fetched_at            timestamptz not null default now(),
  like_count            int,
  reply_count           int,
  retweet_count         int,
  quote_count           int,
  bookmark_count        int,
  impression_count      int,
  reach_score           int,
  raw                   jsonb not null default '{}'::jsonb
);
create unique index if not exists social_mention_platform_id_uidx on social_mention (platform, platform_post_id);
create index if not exists social_mention_topic_time_idx  on social_mention (topic, posted_at desc)  where topic is not null;
create index if not exists social_mention_author_time_idx on social_mention (author_username, posted_at desc) where author_username is not null;
create index if not exists social_mention_posted_at_idx   on social_mention (posted_at desc);

-- Triggers applied separately via run_sql on main (Neon connector parser can't dollar-quote):
-- create trigger tg_list_binding_updated             before update on list_binding             for each row execute function tg_touch_updated_at();
-- create trigger tg_linkedin_topic_tag_updated       before update on linkedin_topic_tag       for each row execute function tg_touch_updated_at();
-- create trigger tg_linkedin_monitor_config_updated  before update on linkedin_monitor_config  for each row execute function tg_touch_updated_at();
