-- 126_spk_company_dedupe.sql
--
-- v_spk_companies joined compat._spk_id, which holds one row per LEGACY id, so
-- a canonical company that absorbed two legacy rows was emitted twice. Both
-- copies carried the same canonical name, description and rollup, differing
-- only in the id column -- so the speakers list showed "AWS" twice with nine
-- speakers each, and "Microsoft Research" reporting Microsoft's nine speakers
-- rather than its one. That is true in neither model: the legacy reading is
-- gone (the row is no longer labelled "Microsoft Research") while the canonical
-- reading is double-counted. Ten companies were affected: AMD, AWS (twice, on
-- two domains), Band, Dataiku, Google, McKinsey, Microsoft, Temporal, Uber.
--
-- compat._spk_primary already collapses those to one deterministic legacy id
-- per company and was simply never used here. The list drops from 558 rows to
-- 548, which is the merge doing what it was asked to do -- decision 4 was
-- "merge ... no duplicates".
--
-- The ten displaced legacy ids stay resolvable through spk_company_alias, so an
-- existing link or bookmark still lands on the surviving company instead of
-- 404ing.

begin;

create or replace view compat.spk_company_alias as
  select i.legacy_id            as alias_id,
         p.legacy_id            as primary_id,
         i.entity_id            as company_id
    from compat._spk_id i
    join compat._spk_primary p
      on p.entity_id = i.entity_id
     and p.legacy_table = i.legacy_table
   where i.legacy_table = 'spk_companies';

comment on view compat.spk_company_alias is
  'Every legacy speaker-CRM company id mapped to the one that survived the merge. Lets a link built before the merge still resolve.';

create or replace view compat.v_spk_companies as
  select m.legacy_id as id,
         c.name, c.domain, c.website_url as website,
         p.category, c.description, p.product_positioning, p.target_buyer,
         p.is_sponsor, p.is_exhibitor, c.sponsor_tier, c.linkedin_url,
         p.hq_location, p.employee_range, p.score_overall, p.best_fit_summit,
         p.summit_fit_summary, p.suggested_pitch, p.outreach_angle,
         p.is_vendor, p.segment, p.confidence, p.rationale, p.method,
         r.speakers, r.sessions, r.conferences
    from public.company c
    -- _spk_primary, not _spk_id: one row per company, not one per legacy id.
    join compat._spk_primary m
      on m.entity_id = c.id and m.legacy_table = 'spk_companies'
    left join signals.speaker_company_profile p on p.company_id = c.id
    left join compat._spk_company_rollup r on r.company_id = c.id;

commit;
