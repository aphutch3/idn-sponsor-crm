-- 112_legacy_id_safe_cast.sql
--
-- The compat views that recover a legacy integer id write
--
--     split_part(er.external_id, ':', 2)::bigint
--   where er.external_id like 'linkedin_post:%'
--
-- which reads as if the cast only ever sees digits. It does not. A view's
-- select-list expression and its WHERE clause are not ordered, so when the
-- planner pulls the view into a larger query it may evaluate the cast on rows
-- the prefix filter would have rejected. external_ref holds refs for every
-- source in the database, including YouTube video ids like 'fPrrLIp_Z58', and
-- casting one of those to bigint aborts the whole query:
--
--     invalid input syntax for type bigint: "fPrrLIp_Z58"
--
-- The failure is planner-dependent, so the same view can work for months and
-- then break when a table grows enough to change a join order. Guarding the
-- cast makes the expression safe for ANY input rather than relying on a filter
-- being applied first.

begin;

create or replace function public.legacy_bigint(external_id text, prefix text)
returns bigint
language sql
immutable
parallel safe
returns null on null input
as $$
  -- NULL, never an error, when this ref does not carry the expected prefix
  -- followed by digits. A ref that should have matched and does not is a
  -- missing row, which the caller's join already treats as absent.
  select case
           when external_id like prefix || ':%'
            and split_part(external_id, ':', 2) ~ '^[0-9]+$'
           then split_part(external_id, ':', 2)::bigint
         end;
$$;

comment on function public.legacy_bigint(text, text) is
  'Recover a legacy integer id from an external_ref external_id. Returns NULL instead of raising when the ref belongs to another source, because a view select-list cast is not guaranteed to run after the view WHERE clause.';

create or replace view compat.li_profile_id as
select er.entity_id as account_id,
       public.legacy_bigint(er.external_id, 'linkedin_profile') as id
  from public.external_ref er
 where er.entity_table = 'platform_account'
   and er.source_system = 'news_dashboard'
   and er.external_id like 'linkedin_profile:%';

create or replace view compat.li_post_id as
select er.entity_id as content_item_id,
       public.legacy_bigint(er.external_id, 'linkedin_post') as id
  from public.external_ref er
 where er.entity_table = 'content_item'
   and er.source_system = 'news_dashboard'
   and er.external_id like 'linkedin_post:%';

create or replace view compat.li_engagement_id as
select er.entity_id as observation_id,
       public.legacy_bigint(er.external_id, 'linkedin_engagement') as id
  from public.external_ref er
 where er.entity_table = 'linkedin_engagement_observation'
   and er.source_system = 'news_dashboard'
   and er.external_id like 'linkedin_engagement:%';

create or replace view compat.li_run_id as
select er.entity_id as job_run_id,
       public.legacy_bigint(er.external_id, 'linkedin_sweep_run') as id
  from public.external_ref er
 where er.entity_table = 'job_run'
   and er.source_system = 'news_dashboard'
   and er.external_id like 'linkedin_sweep_run:%';

commit;
