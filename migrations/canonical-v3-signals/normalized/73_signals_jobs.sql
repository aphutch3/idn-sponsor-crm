-- 73_signals_jobs.sql  (release canonical-v3-signals)
--
-- Unified job queue and run log.
--
-- WHAT THIS REPLACES
-- ------------------
-- The source system grew one queue table per button and one run table per
-- integration, each an independent copy of the same shape:
--
--   queues : ingestion_requests, top_stories_requests, executive_brief_requests,
--            variations_requests, x_ingestion_requests, gh_ingestion_requests,
--            yt_ingestion_requests                       (7 tables)
--   runs   : ingestion_runs, x_sync_runs, gh_sync_runs, yt_sync_runs,
--            spk_sync_runs, linkedin_sweep_run           (6 tables)
--
-- Every queue table carries the same columns (status, requested_at,
-- started_at, finished_at, summary, error) and every run table carries
-- (status, started_at, finished_at, error) plus its own counters. Thirteen
-- tables encoding two concepts is the single largest duplication in the source
-- schema, and it forces every new integration to copy a table and every
-- dashboard query to UNION across an open-ended list.
--
-- Here they become:
--   signals.job_request   -- one row per queued unit of work
--   signals.job_run       -- one row per execution
--   signals.job_run_metric -- per-run counters, as rows
--
-- WHY COUNTERS ARE ROWS, NOT COLUMNS OR JSONB
-- -------------------------------------------
-- Across the six run tables there are ~20 distinct counters (new_articles,
-- reader_ok, repos_failed, stars_delta, quota_units, authored_kept, ...) with
-- almost no overlap. Typed columns for all of them produce a table that is
-- mostly NULL and whose applicable columns an agent cannot infer. A jsonb blob
-- would hide the vocabulary entirely, which breaks the requirement that schema
-- labels stay legible and consistent.
--
-- Rows in job_run_metric, with the vocabulary constrained by a lookup table,
-- keep the counters queryable AND self-describing, and match the append-only
-- observation pattern already used by public.content_metric and
-- signals.account_metric.

begin;

create type signals.job_kind as enum (
  'newsletter_ingest',
  'top_stories',
  'executive_brief',
  'variations',
  'x_account_ingest',
  'x_sync',
  'github_sync',
  'youtube_sync',
  'linkedin_sweep',
  'speaker_sync',
  'reader_prefetch',
  'majors_analysis'
);

create type signals.job_status as enum (
  'pending',
  'running',
  'done',
  'failed',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- job_request : the queue
-- ---------------------------------------------------------------------------
create table signals.job_request (
  id            uuid primary key default gen_random_uuid(),
  kind          signals.job_kind not null,
  status        signals.job_status not null default 'pending',

  -- Per-kind arguments (max_posts, target username, template id...). These are
  -- caller intent, not modeled facts, and differ per kind by design.
  params        jsonb not null default '{}'::jsonb,

  requested_at  timestamptz not null default now(),
  requested_by  text,
  started_at    timestamptz,
  finished_at   timestamptz,

  summary       jsonb,
  error         text,

  -- Set when a worker picks the row up, so a crashed worker's claim is visible.
  run_id        uuid,

  constraint job_request_timing_ck check (
    (started_at is null or started_at >= requested_at) and
    (finished_at is null or started_at is not null) and
    (finished_at is null or finished_at >= started_at)
  ),
  -- A terminal row must say how it ended; a failed row must say why.
  constraint job_request_terminal_ck check (
    (status in ('done','failed','cancelled')) = (finished_at is not null)
  ),
  constraint job_request_error_ck check (
    status <> 'failed' or error is not null
  )
);

-- The claim query: oldest pending row of a kind. Partial so the index stays
-- small as completed history accumulates.
create index job_request_pending_ix
  on signals.job_request (kind, requested_at)
  where status = 'pending';

-- Operator history view, newest first.
create index job_request_recent_ix
  on signals.job_request (kind, requested_at desc);

-- A stuck-worker sweep looks for running rows that started too long ago.
create index job_request_running_ix
  on signals.job_request (started_at)
  where status = 'running';

comment on table signals.job_request is
  'Unified work queue replacing seven per-button request tables. One row per queued unit of work; workers claim the oldest pending row of a kind.';

-- ---------------------------------------------------------------------------
-- job_run : the execution log
-- ---------------------------------------------------------------------------
create table signals.job_run (
  id             uuid primary key default gen_random_uuid(),
  kind           signals.job_kind not null,
  status         signals.job_status not null default 'running',

  job_request_id uuid references signals.job_request(id) on delete set null,

  started_at     timestamptz not null default now(),
  finished_at    timestamptz,

  -- Cross-cutting cost/telemetry that every integration reports in the same
  -- units, so these earn typed columns.
  api_calls      integer,
  est_cost_usd   numeric(12,4),

  params         jsonb not null default '{}'::jsonb,
  summary        jsonb,
  error          text,

  constraint job_run_timing_ck check (
    finished_at is null or finished_at >= started_at
  ),
  constraint job_run_terminal_ck check (
    (status in ('done','failed','cancelled')) = (finished_at is not null)
  ),
  constraint job_run_cost_ck check (
    (api_calls is null or api_calls >= 0) and
    (est_cost_usd is null or est_cost_usd >= 0)
  )
);

create index job_run_recent_ix
  on signals.job_run (kind, started_at desc);

-- Health checks ask "how long since a successful run of kind X?"
create index job_run_success_ix
  on signals.job_run (kind, finished_at desc)
  where status = 'done';

-- ...and "how many consecutive failures?"
create index job_run_failure_ix
  on signals.job_run (kind, started_at desc)
  where status = 'failed';

comment on table signals.job_run is
  'Unified execution log replacing six per-integration run tables. Cross-cutting cost columns are typed; per-kind counters live in signals.job_run_metric.';

alter table signals.job_request
  add constraint job_request_run_fk
  foreign key (run_id) references signals.job_run(id) on delete set null;

-- ---------------------------------------------------------------------------
-- job_metric_kind : the counter vocabulary
-- ---------------------------------------------------------------------------
-- A lookup table rather than an enum: operators add counters as integrations
-- evolve, and adding a row must not require a migration. The foreign key still
-- prevents free-text drift, so 'new_articles' can never be spelled three ways.
create table signals.job_metric_kind (
  code        text primary key,
  label       text not null,
  unit        text not null default 'count',
  description text,
  constraint job_metric_kind_code_ck check (code ~ '^[a-z][a-z0-9_]*$')
);

comment on table signals.job_metric_kind is
  'Controlled vocabulary for per-run counters. A lookup table, not an enum, so new counters do not require a schema migration; the FK still prevents spelling drift.';

insert into signals.job_metric_kind (code, label, unit, description) values
  ('new_articles',     'New articles',        'count', 'Articles created by this run.'),
  ('new_issues',       'New issues',          'count', 'Newsletter editions created by this run.'),
  ('new_sources',      'New sources',         'count', 'Sources created by this run.'),
  ('new_sponsors',     'New sponsors',        'count', 'Sponsors created by this run.'),
  ('new_sponsorships', 'New sponsorships',    'count', 'Sponsorship links created by this run.'),
  ('total_articles',   'Total articles',      'count', 'Article total observed at run end.'),
  ('total_issues',     'Total issues',        'count', 'Edition total observed at run end.'),
  ('reader_ok',        'Reader prefetch ok',  'count', 'Full-text prefetches that succeeded.'),
  ('reader_failed',    'Reader prefetch failed','count','Full-text prefetches that failed.'),
  ('items_read',       'Items read',          'count', 'Records fetched from the upstream API.'),
  ('items_written',    'Items written',       'count', 'Records upserted locally.'),
  ('new_posts',        'New posts',           'count', 'Posts created by this run.'),
  ('repos_total',      'Repos total',         'count', 'Repositories considered.'),
  ('repos_ok',         'Repos ok',            'count', 'Repositories synced successfully.'),
  ('repos_failed',     'Repos failed',        'count', 'Repositories that failed to sync.'),
  ('stars_delta',      'Stars delta',         'count', 'Net change in stars across synced repos.'),
  ('channels',         'Channels',            'count', 'Channels considered.'),
  ('quota_units',      'Quota units',         'unit',  'Upstream API quota consumed.'),
  ('rate_remaining',   'Rate limit remaining','unit',  'Upstream rate-limit budget left at run end.'),
  ('profiles_queried', 'Profiles queried',    'count', 'Profiles requested from the provider.'),
  ('authored_kept',    'Authored kept',       'count', 'Authored posts retained after filtering.'),
  ('engagement_kept',  'Engagement kept',     'count', 'Engagement records retained after filtering.'),
  ('no_result_count',  'No result',           'count', 'Queries that returned nothing.'),
  ('items',            'Items',               'count', 'Generic item count for runs without a richer vocabulary.');

create table signals.job_run_metric (
  job_run_id  uuid not null references signals.job_run(id) on delete cascade,
  metric_code text not null references signals.job_metric_kind(code),
  value       bigint not null,
  primary key (job_run_id, metric_code)
);

create index job_run_metric_code_ix
  on signals.job_run_metric (metric_code, value desc);

comment on table signals.job_run_metric is
  'Per-run counters as rows. Avoids both a sparse wide table and an opaque jsonb blob; the vocabulary is constrained by signals.job_metric_kind.';

commit;
