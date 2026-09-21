-- 131_spk_lists_native_rows.sql
--
-- compat.spk_lists and compat.spk_list_members inner-join the legacy id map, so
-- a row is only visible if it came from the speaker CRM. That is right for a
-- read-only mirror, but the speaker app creates lists -- POST
-- /api/speakers/lists, and the add/remove member routes -- and a list created
-- against canonical has no legacy id to join to. It would be written
-- successfully and then vanish from every read.
--
-- Both views now fall back to the canonical id when no legacy ref exists. The
-- app treats the id as opaque and round-trips it, so a canonical uuid works
-- exactly as well as a legacy one. Rows that DO have a legacy ref keep
-- reporting it, so nothing already mirrored changes: all three existing speaker
-- lists are unaffected, and /api/speakers/lists stays byte-identical.
--
-- A speaker list is distinguished from an Engager list by entity_types holding
-- 'company' plus a slug in raw, which is what the loader writes. Without that
-- filter the three "LinkedIn watch:" Engager lists would surface in the speaker
-- app as untitled, slugless lists.

begin;

create or replace view compat.spk_lists as
  select coalesce(m.legacy_id, l.id)                       as id,
         l.name,
         l.raw ->> 'slug'                                  as slug,
         l.description,
         coalesce((l.raw ->> 'legacy_created_at')::timestamptz, l.created_at) as created_at,
         coalesce((l.raw ->> 'legacy_updated_at')::timestamptz, l.updated_at) as updated_at
    from public.list l
    left join compat._spk_id m
      on m.entity_id = l.id and m.legacy_table = 'spk_lists'
   where m.legacy_id is not null
      or (l.raw ? 'slug' and 'company' = any (l.entity_types));

create or replace view compat.spk_list_members as
  select coalesce(lm.legacy_id, m.list_id)   as list_id,
         coalesce(cm.legacy_id, m.entity_id) as company_id,
         m.meta ->> 'note'                   as note,
         m.meta ->> 'status'                 as status,
         m.added_at
    from public.list_member m
    left join compat._spk_primary lm
      on lm.entity_id = m.list_id and lm.legacy_table = 'spk_lists'
    left join compat._spk_primary cm
      on cm.entity_id = m.entity_id and cm.legacy_table = 'spk_companies'
   where m.entity_table = 'company'
     and (lm.legacy_id is not null
          or exists (select 1 from public.list l
                      where l.id = m.list_id
                        and l.raw ? 'slug'
                        and 'company' = any (l.entity_types)));

commit;
