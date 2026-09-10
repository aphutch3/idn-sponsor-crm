-- 015_social_refresh_log.sql
--
-- Create public.social_refresh_log on canonical. The refresh_social_mentions
-- cron writes a run summary row per execution, and the /influencers/socializers
-- page reads the most recent row for the "last refresh" indicator.
--
-- Pre-existing on Neon: stg_engager.social_refresh_log (9 rows from initial
-- engager ingest). We keep those in staging as-is; the new canonical table
-- starts fresh with post-cutover runs.
--
-- Rollback: drop table public.social_refresh_log cascade;

set search_path = public;

create table if not exists public.social_refresh_log (
  id             uuid                     primary key default gen_random_uuid(),
  ran_at         timestamp with time zone not null    default now(),
  duration_ms    integer                  not null,
  queries_run    integer                  not null,
  posts_inserted integer                  not null default 0,
  posts_updated  integer                  not null default 0,
  errors         jsonb
);

create index if not exists social_refresh_log_ran_at_idx
  on public.social_refresh_log (ran_at desc);

comment on table public.social_refresh_log is
  'Per-run summary rows written by scripts/refresh_social_mentions.py. '
  'Read by /influencers/socializers page for "last refresh" indicator.';
