-- 122_sponsorship_lineage.sql
--
-- The newsletter domain records legacy lineage in a `raw` payload keyed by the
-- legacy table name -- content_edition.raw->'issues', content_item.raw->'articles'
-- -- and every compat view in that domain reads the legacy id straight back out
-- of it. content_sponsorship was built without one, so its compat view had no
-- way to return the integer ids the routes filter on.
begin;
alter table signals.content_sponsorship
  add column if not exists raw jsonb not null default '{}'::jsonb;
comment on column signals.content_sponsorship.raw is
  'Source row as received, keyed by legacy table name. Carries the legacy id the compat views expose.';
commit;
