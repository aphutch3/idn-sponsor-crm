-- 132_v_spk_list_members_native.sql
--
-- Migration 131 made compat.spk_lists and compat.spk_list_members show a list
-- created against canonical, but missed compat.v_spk_list_members -- the
-- enriched view the app actually reads member counts from. So a new list
-- appeared in /api/speakers/lists with "companies: 0" while holding two
-- members: written, visible, and reported empty.
--
-- Same treatment: fall back to the canonical id when there is no legacy ref,
-- and keep reporting the legacy id when there is, so every mirrored list is
-- unchanged. The join to company stays inner -- a member with no company row
-- has nothing to enrich and should not be listed.

begin;

create or replace view compat.v_spk_list_members as
  select coalesce(lm_id.legacy_id, l.id)  as list_id,
         l.raw ->> 'slug'                 as list_slug,
         l.name                           as list_name,
         coalesce(cm.legacy_id, c.id)     as company_id,
         lm.meta ->> 'note'               as note,
         coalesce(lm.meta ->> 'status', 'new') as status,
         lm.added_at,
         c.name,
         c.domain,
         p.is_sponsor,
         p.score_overall,
         p.segment,
         p.is_vendor,
         r.speakers
    from public.list_member lm
    join public.list l on l.id = lm.list_id
    left join compat._spk_id lm_id
      on lm_id.entity_id = l.id and lm_id.legacy_table = 'spk_lists'
    join public.company c on c.id = lm.entity_id
    left join compat._spk_primary cm
      on cm.entity_id = c.id and cm.legacy_table = 'spk_companies'
    left join signals.speaker_company_profile p on p.company_id = c.id
    left join compat._spk_company_rollup r on r.company_id = c.id
   where lm.entity_table = 'company'
     and (lm_id.legacy_id is not null
          or (l.raw ? 'slug' and 'company' = any (l.entity_types)));

commit;
