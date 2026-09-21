-- 110_linkedin_observed_author.sql
--
-- Two corrections found by running the LinkedIn endpoints side by side against
-- the legacy database.
--
-- 1. THE OBSERVED AUTHOR LABEL IS A FACT, NOT A DUPLICATE.
--
--    108 resolved the author of an engagement to a platform_account and
--    dropped the author_name and author_url the sweep had recorded, on the
--    reasoning that the account already carries both. Comparing the two
--    databases showed that reasoning was incomplete.
--
--    The LinkedIn roster row for the a16z COMPANY page carries the display
--    name "Camille van Horne" -- a person's name on a company page. The legacy
--    network view never showed that, because it reads the name the SWEEP
--    observed ("Andreessen Horowitz"), not the roster's. So the observed label
--    is not a copy of the account's identity; it is independent evidence, and
--    here it is the more accurate of the two.
--
--    The same holds for the URL: the observed one carries a per-observation
--    miniProfileUrn tracking parameter, which makes it an artifact of that
--    single sighting rather than the account's address.
--
--    So the reference stays -- it is what makes roster membership a join and
--    keeps one row per author instead of a name repeated on every edge -- and
--    the observed pair is recorded alongside it as provenance, exactly as
--    content_item keeps `raw`. Identity resolves through the account; what the
--    sweep saw stays auditable.
--
-- 2. est_cost_usd SILENTLY ROUNDED MONEY.
--
--    The column is numeric(12,4) and the Apify charges are recorded to five
--    decimal places: 1.35405 was stored as 1.3541. Small per row, but these
--    are summed into a spend total against a budget, and a rounding error that
--    accumulates in the same direction is the one kind you cannot see in any
--    single row. Widened to six places, which covers the source data with
--    room left, and the affected rows are re-read from source by the loader.

begin;

alter table signals.linkedin_engagement_observation
  add column if not exists observed_author_name text,
  add column if not exists observed_author_url  text;

comment on column signals.linkedin_engagement_observation.observed_author_name is
  'The author name as the sweep reported it. Independent of the account display name, which can disagree and be less accurate.';
comment on column signals.linkedin_engagement_observation.observed_author_url is
  'The author URL as the sweep reported it, tracking parameters included. The account address lives on platform_account.url.';

-- Three compat views read est_cost_usd, and Postgres refuses to change the
-- type of a column a view depends on. They are dropped and recreated from
-- their own stored definitions in the same transaction, so no window exists
-- where the app can observe them missing. Their SQL is unchanged -- only the
-- width of the underlying column moves.
drop view if exists compat.linkedin_sweep_run cascade;
drop view if exists compat.x_sync_runs;
drop view if exists compat.yt_sync_runs;

alter table signals.job_run
  alter column est_cost_usd type numeric(14, 6);

-- compat.linkedin_sweep_run and compat.v_li_runs (which cascades off it) are
-- recreated by re-running 109, whose definitions are authoritative. The two
-- views below belong to earlier migrations, so their definitions are restored
-- here verbatim rather than left to a replay of those files.


create or replace view compat.x_sync_runs as  SELECT id,
    COALESCE(params ->> 'legacy_kind'::text, kind::text) AS kind,
    status::text AS status,
    started_at,
    finished_at,
    api_calls,
    est_cost_usd,
    summary -> 'items'::text AS items,
    summary -> 'detail'::text AS detail,
    error
   FROM signals.job_run r
  WHERE kind = 'x_sync'::signals.job_kind;

create or replace view compat.yt_sync_runs as  SELECT split_part(er.external_id, ':'::text, 2)::bigint AS id,
    r.params ->> 'job'::text AS job,
    r.params ->> 'backend'::text AS backend,
    r.status::text AS status,
    r.started_at,
    r.finished_at,
    (r.params ->> 'channels'::text)::integer AS channels,
    (r.params ->> 'items_read'::text)::integer AS items_read,
    (r.params ->> 'items_written'::text)::integer AS items_written,
    r.api_calls,
    r.est_cost_usd,
    (r.params ->> 'quota_units'::text)::integer AS quota_units,
    r.params -> 'params'::text AS params,
    r.summary,
    r.error
   FROM signals.job_run r
     JOIN external_ref er ON er.entity_table = 'job_run'::text AND er.entity_id = r.id AND er.source_system = 'news_dashboard'::text AND er.external_id ~~ 'yt_sync_runs:%'::text
  WHERE r.kind = 'youtube_sync'::signals.job_kind;

commit;
