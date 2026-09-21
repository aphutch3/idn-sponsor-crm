-- 104_x_list_counters.sql
--
-- X-REPORTED list counters.
--
-- These are NOT the same facts as the stored_members / total_followers
-- rollups in compat.v_x_lists_enriched. Those are computed from the
-- memberships we actually hold; these are what X itself reports for the list,
-- and the legacy view deliberately exposed both side by side so the UI can
-- show "we have 19 of the 24 members X says this list has".
--
-- Kept as columns on the list rather than as a metric series. account_metric
-- exists because follower counts per account are sampled repeatedly and their
-- history is read; these two are overwritten wholesale by each list sync and
-- nothing reads their history, so a series would add a join and an
-- append-only trigger for no recoverable fact.

begin;

alter table signals.x_list
  add column if not exists member_count   bigint,
  add column if not exists follower_count bigint;

comment on column signals.x_list.member_count is
  'Members X reports for this list. Compare with the count of x_list_member rows, which is what we actually hold.';
comment on column signals.x_list.follower_count is
  'Followers X reports for this list.';

commit;
