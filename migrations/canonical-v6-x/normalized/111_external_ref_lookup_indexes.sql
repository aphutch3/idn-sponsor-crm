-- 111_external_ref_lookup_indexes.sql
--
-- The compat views recover a row's legacy integer id from external_ref, which
-- is the right place for it: the canonical tables key on uuid and storing the
-- legacy id a second time on the entity is how two identities drift apart.
--
-- But the lookup is a JOIN on entity_id filtered by a prefix on external_id,
-- and no index supported that shape. The planner re-executed the lookup once
-- per outer row and scanned all 452 matching refs each time -- 1,842 posts
-- times 452 refs, which is where 2.6 of the 2.7 seconds on the posts view
-- went.
--
-- These partial indexes key on entity_id with the prefix in the PREDICATE, so
-- each lookup returns the single row it wants instead of the whole set. The
-- predicate is immutable, so it is a legal partial index. They cover only
-- news_dashboard LinkedIn refs, which keeps them small and leaves the other
-- source systems untouched.

begin;

create index if not exists external_ref_li_profile_lookup
  on public.external_ref (entity_id) include (external_id)
  where entity_table = 'platform_account'
    and source_system = 'news_dashboard'
    and external_id like 'linkedin_profile:%';

create index if not exists external_ref_li_post_lookup
  on public.external_ref (entity_id) include (external_id)
  where entity_table = 'content_item'
    and source_system = 'news_dashboard'
    and external_id like 'linkedin_post:%';

create index if not exists external_ref_li_engagement_lookup
  on public.external_ref (entity_id) include (external_id)
  where entity_table = 'linkedin_engagement_observation'
    and source_system = 'news_dashboard'
    and external_id like 'linkedin_engagement:%';

commit;

analyze public.external_ref;
