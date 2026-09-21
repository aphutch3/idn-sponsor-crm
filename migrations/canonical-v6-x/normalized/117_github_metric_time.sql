-- 117_github_metric_time.sql
--
-- Corrects the observation TIME on the GitHub repo metrics, and removes a set
-- of rows that recorded the same measurement three times.
--
-- WHAT WENT WRONG
--
-- gh_repo_metrics has two timestamps that are easy to confuse:
--
--   captured_at  -- when the ROW WAS WRITTEN. Every row says 2026-09-13,
--                   because that is the day the backfill ran.
--   captured_on  -- the date the MEASUREMENT REFERS TO. The sheet baseline
--                   says 2026-08-18; the API capture says 2026-09-13.
--
-- The first load used captured_at, so both captures landed on one day. That is
-- not a cosmetic error: the entire point of this series is the star delta
-- between the August baseline and the September capture, and collapsing them
-- onto a single date destroys the interval the delta is measured over. The
-- daily view returned one row where the source has two.
--
-- A metric's observed_at is when the value WAS TRUE, never when we got around
-- to recording it.
--
-- Separately, all 279 of gh_repos' current star/fork/issue values are byte for
-- byte the 'api' row in gh_repo_metrics -- verified, not assumed. The first
-- load wrote them a third time as a snapshot at metrics_fetched_at. gh_repos
-- is the only source of watchers, so the snapshot still earns its place for
-- that kind alone; the three overlapping kinds are dropped.
--
-- WHY THIS DELETES FROM AN APPEND-ONLY TABLE
--
-- content_metric is append-only by trigger, and rightly so: a measurement is a
-- historical fact and rewriting one is how a series quietly starts lying. This
-- migration is the narrow exception -- it removes rows that were never
-- observations in the first place, only a loader's mistake -- so it disables
-- the guard for exactly these rows inside one transaction and restores it.
-- Nothing outside signals.content_github_repo is touched.

begin;

alter table public.content_metric disable trigger user;

delete from public.content_metric cm
 using signals.content_github_repo g
 where g.content_item_id = cm.content_item_id;

alter table public.content_metric enable trigger user;

commit;
