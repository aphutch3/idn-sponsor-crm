-- IDN Canonical Schema Contract v2 :: Signals application schema
-- Release candidate canonical-v2-content. Execute only through the guarded release runner.
--
-- The signals schema holds facts that belong to the Signals application alone.
-- Shared identity and shared content stay in public. Two rules govern this boundary:
--   * A row in signals.person_profile IS the statement "this canonical person is a
--     Signals-tracked individual". Membership is the row, never a flag on public.person.
--   * Cached third-party article bodies are an operational artifact of Signals'
--     reader pipeline, not canonical published content, so they never live on content_item.

begin;

create schema if not exists signals;

comment on schema signals is
  'Application-private schema for IDN Signals. Shared identity and content remain in public.';

-- ---------------------------------------------------------------------------
-- signals.person_profile :: Signals membership predicate over canonical identity
-- ---------------------------------------------------------------------------

create table if not exists signals.person_profile (
  person_id uuid primary key references public.person(id) on delete cascade,
  tracked_since timestamptz not null default now(),
  is_active boolean not null default true,
  archetype text,
  influence_score numeric(6,3),
  notes text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signals_person_profile_archetype_check
    check (archetype is null or archetype in ('strategist', 'architect', 'engineer')),
  constraint signals_person_profile_influence_range
    check (influence_score is null or (influence_score >= 0 and influence_score <= 100))
);

drop trigger if exists tg_signals_person_profile_updated on signals.person_profile;
create trigger tg_signals_person_profile_updated
before update on signals.person_profile
for each row execute function public.tg_touch_updated_at();

create index if not exists signals_person_profile_active_idx
  on signals.person_profile (is_active, influence_score desc nulls last);

-- ---------------------------------------------------------------------------
-- signals.reader_cache :: operational cache of fetched article bodies
--
-- fetch_state records the outcome of the prefetch attempt. A failed fetch is a real,
-- retained observation: it is the reason a re-prefetch would be a data-loss event,
-- so failures are stored rather than discarded.
--
-- reader_title and reader_byline are retained separately from content_item.title
-- because the fetched page frequently disagrees with the newsletter headline, and
-- that disagreement is itself signal.
-- ---------------------------------------------------------------------------

create table if not exists signals.reader_cache (
  content_item_id uuid primary key references public.content_item(id) on delete cascade,
  fetch_state text not null,
  fetch_method text,
  reader_title text,
  reader_byline text,
  reader_content text,
  word_count integer,
  fetched_at timestamptz,
  attempt_count integer not null default 0,
  error text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signals_reader_cache_fetch_state_check
    check (fetch_state in ('pending', 'ok', 'failed', 'skipped')),
  constraint signals_reader_cache_fetch_method_check
    check (fetch_method is null or fetch_method in ('native', 'firecrawl', 'other')),
  constraint signals_reader_cache_attempt_count_nonnegative
    check (attempt_count >= 0),
  constraint signals_reader_cache_word_count_nonnegative
    check (word_count is null or word_count >= 0),
  -- A successful fetch must carry both a body and the time it was fetched.
  constraint signals_reader_cache_ok_requires_content
    check (fetch_state <> 'ok' or (reader_content is not null and fetched_at is not null)),
  -- A failure must record why.
  constraint signals_reader_cache_failed_requires_error
    check (fetch_state <> 'failed' or error is not null)
);

drop trigger if exists tg_signals_reader_cache_updated on signals.reader_cache;
create trigger tg_signals_reader_cache_updated
before update on signals.reader_cache
for each row execute function public.tg_touch_updated_at();

-- Retry queue: which items still need a body, oldest attempt first.
create index if not exists signals_reader_cache_retry_idx
  on signals.reader_cache (attempt_count, fetched_at nulls first)
  where fetch_state in ('pending', 'failed');

create index if not exists signals_reader_cache_state_idx
  on signals.reader_cache (fetch_state);

-- ---------------------------------------------------------------------------
-- Documentation
-- ---------------------------------------------------------------------------

comment on table signals.person_profile is
  'A tracked Signals individual. The existence of this row is the membership statement. Grain: one canonical person. Authority: app-owned.';
comment on table signals.reader_cache is
  'Operational cache of a third-party article body fetched by the Signals reader pipeline, including retained failures. Grain: one content item. Authority: app-owned.';

commit;
