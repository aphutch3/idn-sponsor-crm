-- IDN Canonical Schema Contract v2 :: content domain
-- Release candidate canonical-v2-content. Execute only through the guarded release runner.
-- Adds the shared, platform-agnostic content spine: sources, periodical editions,
-- items, entity relationships, observed metrics and model-derived enrichment.
--
-- Design contract:
--   * A content item is one addressable piece of published content, whatever the platform.
--   * Platform-specific facts never become nullable columns on content_item. They live in
--     a one-to-one detail table (newsletter here; app-private detail in the signals schema).
--   * Entities related to an item are rows in content_entity, never text arrays.
--   * Metrics are append-only observations. A row is never overwritten.
--   * Identity stays canonical: authorship resolves to public.person, ownership to
--     public.company. This release never invents either from a display name.

begin;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'content_kind') then
    create type public.content_kind as enum (
      'newsletter_article',
      'x_post',
      'youtube_video',
      'linkedin_post',
      'github_repo',
      'github_issue',
      'podcast_episode',
      'voices_story',
      'session_abstract',
      'external_article',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'content_metric_kind') then
    create type public.content_metric_kind as enum (
      'view',
      'like',
      'reply',
      'repost',
      'quote',
      'bookmark',
      'comment',
      'share',
      'click',
      'open',
      'star',
      'fork',
      'watcher',
      'subscriber',
      'follower',
      'open_issue',
      'open_pr',
      'contributor',
      'release',
      'engagement_score',
      'reach_score'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- content_publication :: the site a linked article lives on
-- ---------------------------------------------------------------------------

create table if not exists public.content_publication (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  normalized_domain text not null,
  name text,
  company_id uuid references public.company(id) on delete set null,
  source_system text references public.source_system(code),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_publication_domain_not_blank check (length(btrim(domain)) > 0)
);

create unique index if not exists content_publication_normalized_domain_uk
  on public.content_publication (normalized_domain);

-- ---------------------------------------------------------------------------
-- content_source :: a channel that publishes content
-- ---------------------------------------------------------------------------

create table if not exists public.content_source (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  kind public.content_kind not null,
  name text not null,
  normalized_name text not null,
  company_id uuid references public.company(id) on delete set null,
  person_id uuid references public.person(id) on delete set null,
  homepage_url text,
  feed_url text,
  external_handle text,
  is_active boolean not null default true,
  description text,
  source_system text references public.source_system(code),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_source_slug_not_blank check (length(btrim(slug)) > 0),
  -- A channel is owned by an organisation or by an individual, never asserted as both.
  constraint content_source_single_owner_check
    check (company_id is null or person_id is null)
);

create unique index if not exists content_source_slug_uk
  on public.content_source (slug);

-- ---------------------------------------------------------------------------
-- content_edition :: one dated issue of a periodical source
-- ---------------------------------------------------------------------------

create table if not exists public.content_edition (
  id uuid primary key default gen_random_uuid(),
  content_source_id uuid not null references public.content_source(id) on delete cascade,
  edition_date date not null,
  edition_number integer,
  title text,
  url text,
  published_at timestamptz,
  source_system text references public.source_system(code),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_edition_number_positive
    check (edition_number is null or edition_number > 0)
);

create unique index if not exists content_edition_source_date_uk
  on public.content_edition (content_source_id, edition_date);

-- ---------------------------------------------------------------------------
-- content_item :: the platform-agnostic spine
-- ---------------------------------------------------------------------------

create table if not exists public.content_item (
  id uuid primary key default gen_random_uuid(),
  kind public.content_kind not null,
  content_source_id uuid references public.content_source(id) on delete set null,
  content_publication_id uuid references public.content_publication(id) on delete set null,
  title text,
  summary text,
  body_text text,
  url text,
  canonical_url text,
  author_person_id uuid references public.person(id) on delete set null,
  published_at timestamptz,
  language text,
  importance_score numeric(6,3),
  is_sponsored boolean not null default false,
  source_system text references public.source_system(code),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_item_importance_range
    check (importance_score is null or (importance_score >= 0 and importance_score <= 100))
);

-- canonical_url is the deduplication key when it is known. It stays null for
-- syndicated placements that legitimately repeat a URL under different headlines,
-- so the uniqueness guarantee is partial by design.
create unique index if not exists content_item_canonical_url_uk
  on public.content_item (canonical_url)
  where canonical_url is not null;

-- ---------------------------------------------------------------------------
-- content_newsletter_item :: one-to-one newsletter placement detail
-- ---------------------------------------------------------------------------

create table if not exists public.content_newsletter_item (
  content_item_id uuid primary key references public.content_item(id) on delete cascade,
  content_edition_id uuid not null references public.content_edition(id) on delete cascade,
  section text,
  position integer,
  item_type text,
  read_time_minutes integer,
  raw_url text,
  constraint content_newsletter_item_position_positive
    check (position is null or position >= 0),
  constraint content_newsletter_item_read_time_positive
    check (read_time_minutes is null or read_time_minutes >= 0)
);

-- ---------------------------------------------------------------------------
-- content_entity :: governed relationships from an item to canonical entities
-- ---------------------------------------------------------------------------

create table if not exists public.content_entity (
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  entity_table text not null,
  entity_id uuid not null,
  role text not null,
  confidence numeric(6,5),
  source_system text references public.source_system(code),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (content_item_id, entity_table, entity_id, role),
  constraint content_entity_entity_table_check
    check (entity_table in ('person', 'company', 'tag', 'event', 'session', 'content_item')),
  constraint content_entity_role_check
    check (role in ('mentioned', 'author', 'subject', 'sponsor', 'speaker',
                    'employer', 'cited', 'quoted', 'publisher')),
  constraint content_entity_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

-- ---------------------------------------------------------------------------
-- content_metric :: append-only observations
-- ---------------------------------------------------------------------------

create table if not exists public.content_metric (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  kind public.content_metric_kind not null,
  value bigint not null,
  observed_at timestamptz not null default now(),
  source_system text references public.source_system(code),
  constraint content_metric_value_nonnegative check (value >= 0)
);

create unique index if not exists content_metric_item_kind_observed_uk
  on public.content_metric (content_item_id, kind, observed_at);

-- ---------------------------------------------------------------------------
-- content_enrichment :: one-to-one model-derived scoring
-- ---------------------------------------------------------------------------

create table if not exists public.content_enrichment (
  content_item_id uuid primary key references public.content_item(id) on delete cascade,
  sentiment text,
  sentiment_score numeric(6,5),
  trend_score numeric(6,3),
  engagement_score numeric(6,3),
  ai_insight text,
  model text,
  scored_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  constraint content_enrichment_sentiment_check
    check (sentiment is null or sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  constraint content_enrichment_sentiment_score_range
    check (sentiment_score is null or (sentiment_score >= -1 and sentiment_score <= 1))
);

-- ---------------------------------------------------------------------------
-- Object documentation
-- ---------------------------------------------------------------------------

comment on type public.content_kind is
  'Platform form of a piece of published content. Shared by content_source.kind and content_item.kind.';
comment on type public.content_metric_kind is
  'Observable engagement or popularity measure recorded against a content item.';

comment on table public.content_publication is
  'One external website that hosts linked articles. Grain: one normalized domain. Authority: canonical.';
comment on table public.content_source is
  'One channel that publishes content, such as a newsletter, social account or video channel. Grain: one channel. Authority: canonical.';
comment on table public.content_edition is
  'One dated issue of a periodical content source. Grain: one issue. Authority: canonical.';
comment on table public.content_item is
  'One addressable piece of published content, independent of platform. Related entities are rows in content_entity and are never stored as text arrays. Grain: one content item. Authority: canonical.';
comment on table public.content_newsletter_item is
  'Newsletter-specific placement detail for a content item. Grain: one item placement within an edition. Authority: canonical.';
comment on table public.content_entity is
  'Governed relationship from a content item to a canonical entity, with role, provenance and confidence. Grain: one item-entity-role relationship. Authority: canonical.';
comment on table public.content_metric is
  'Append-only observation of a content metric at a point in time. Never overwrite a row here; insert a new observation. Grain: one observation. Authority: source evidence.';
comment on table public.content_enrichment is
  'Model-derived scoring for a content item, retained with the model that produced it. Grain: one content item. Authority: derived.';

commit;
