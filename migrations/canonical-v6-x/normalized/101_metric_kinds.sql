-- 101_metric_kinds.sql
--
-- Two counters the X domain reports have no kind in
-- public.content_metric_kind, which signals.account_metric also uses:
--
--   following  -- accounts this account follows
--   post       -- lifetime posts authored by this account
--
-- The enum already carries 'follower', so following/follower are now a
-- symmetric pair rather than one direction being a real metric and the other
-- living in a jsonb blob. 'post' is spelled as the thing counted, matching
-- every other label in the enum ('star', 'fork', 'release'), so YouTube,
-- LinkedIn and GitHub can reuse both rather than inventing per-platform
-- spellings of the same idea.
--
-- These are time-varying counts, so they belong in the append-only metric
-- series, not as mutable columns on platform_account. IF NOT EXISTS keeps the
-- file safe to re-run.

alter type public.content_metric_kind add value if not exists 'following';
alter type public.content_metric_kind add value if not exists 'post';
