-- 113_legacy_id_view_guard.sql
--
-- REGRESSION, caught by the client test suite after the YouTube and LinkedIn
-- loads.
--
-- compat._legacy_id recovers the legacy integer key for every news_dashboard
-- row and is the resolver the newsletter compat views join through:
--
--     split_part(external_id, ':', 2)::bigint as legacy_id
--     where source_system = 'news_dashboard'
--
-- That was safe only for as long as every news_dashboard ref happened to be
-- keyed by an integer. It no longer is. A YouTube video's legacy key is its
-- video id and a tweet's is its tweet id, and content_item is now shared by
-- four sources:
--
--     yt_videos      11,720      articles   7,706
--     x_posts         3,027      linkedin_post 1,842
--
-- so a query as ordinary as fetching one article by id aborts with
--
--     invalid input syntax for type bigint: "fPrrLIp_Z58"
--
-- The lesson is that the cast was load-bearing on an assumption nothing
-- enforced -- exactly the kind that holds until another domain is loaded into
-- the shared database, which is the entire point of this migration.
--
-- legacy_id now returns NULL for a non-integer key instead of raising. The
-- rows stay visible with their legacy_table, so a consumer can still see that
-- a YouTube ref exists; it simply has no integer id to offer. Every consumer
-- joins on legacy_table AND legacy_id, so a NULL never matches and no
-- newsletter row changes.

begin;

create or replace function public.legacy_bigint(external_id text)
returns bigint
language sql
immutable
parallel safe
returns null on null input
as $$
  select case
           when split_part(external_id, ':', 2) ~ '^[0-9]+$'
           then split_part(external_id, ':', 2)::bigint
         end;
$$;

comment on function public.legacy_bigint(text) is
  'The integer part of an external_ref external_id, or NULL when that source does not key by integer. Never raises: the shared external_ref table mixes integer-keyed and string-keyed sources.';

create or replace view compat._legacy_id as
select entity_table,
       entity_id,
       split_part(external_id, ':', 1) as legacy_table,
       public.legacy_bigint(external_id) as legacy_id
  from public.external_ref
 where source_system = 'news_dashboard';

commit;
