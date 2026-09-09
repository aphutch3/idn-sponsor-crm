-- verify_engager_ingest.sql
-- Read-back verification after running 011_engager_ingest.sql on a Neon branch.
-- Every query is SELECT-only. Compare each printed pair to the expected values in comments.

\echo '=== 1. Source row counts (from stg_engager) ==='
select 'stg_engager.companies'            as t, count(*) as n from stg_engager.companies             union all
select 'stg_engager.contacts',                 count(*)      from stg_engager.contacts               union all
select 'stg_engager.activities',               count(*)      from stg_engager.activities             union all
select 'stg_engager.tasks',                    count(*)      from stg_engager.tasks                  union all
select 'stg_engager.lists',                    count(*)      from stg_engager.lists                  union all
select 'stg_engager.list_members',             count(*)      from stg_engager.list_members           union all
select 'stg_engager.list_bindings',            count(*)      from stg_engager.list_bindings          union all
select 'stg_engager.linkedin_topic_tags',      count(*)      from stg_engager.linkedin_topic_tags    union all
select 'stg_engager.linkedin_monitor_configs', count(*)      from stg_engager.linkedin_monitor_configs union all
select 'stg_engager.linkedin_posts',           count(*)      from stg_engager.linkedin_posts         union all
select 'stg_engager.linkedin_snapshots',       count(*)      from stg_engager.linkedin_snapshots     union all
select 'stg_engager.social_mentions',          count(*)      from stg_engager.social_mentions        union all
select 'stg_engager.social_refresh_log',       count(*)      from stg_engager.social_refresh_log;
-- Expected: companies=2087, contacts=3699, activities=2, tasks=1, lists=3, list_members=3,
-- list_bindings=3, linkedin_topic_tags=951, linkedin_monitor_configs=3, linkedin_posts=30,
-- linkedin_snapshots=15, social_mentions=85, social_refresh_log=9

\echo ''
\echo '=== 2. Canonical row counts ==='
select 'company'                 as t, count(*) as n from company                 union all
select 'contact',                       count(*)      from contact                union all
select 'person',                        count(*)      from person                 union all
select 'contact_company',               count(*)      from contact_company        union all
select 'crm_status',                    count(*)      from crm_status             union all
select 'tag',                           count(*)      from tag                    union all
select 'entity_tag',                    count(*)      from entity_tag             union all
select 'activity',                      count(*)      from activity               union all
select 'task',                          count(*)      from task                   union all
select 'list',                          count(*)      from list                   union all
select 'list_member',                   count(*)      from list_member            union all
select 'list_binding',                  count(*)      from list_binding           union all
select 'linkedin_topic_tag',            count(*)      from linkedin_topic_tag     union all
select 'linkedin_monitor_config',       count(*)      from linkedin_monitor_config union all
select 'linkedin_post',                 count(*)      from linkedin_post          union all
select 'linkedin_snapshot',             count(*)      from linkedin_snapshot      union all
select 'social_mention',                count(*)      from social_mention         union all
select 'ingestion_job',                 count(*)      from ingestion_job          union all
select 'external_ref',                  count(*)      from external_ref;

\echo ''
\echo '=== 3. Company dedup check (D1) ==='
-- Domains should be unique in canonical, but multiple engager rows can point to the same domain
select 'companies with domain'          as k, count(*) filter (where domain is not null) as n from company union all
select 'unique domains',                     count(distinct domain) filter (where domain is not null) from company union all
select 'companies without domain',           count(*) filter (where domain is null) from company union all
select 'engager_v1 refs to companies',       count(*) from external_ref where source_system='engager_v1' and entity_table='company' union all
select 'hubspot refs to companies',          count(*) from external_ref where source_system='hubspot' and entity_table='company';
-- Expected: engager_v1 refs = 2087 (every source row has a lineage row, winners and losers).
-- unique domains <= companies with domain (equal when no duplicates in source, less if any).

\echo ''
\echo '=== 4. Contact / person split (D2) ==='
select 'contacts with linkedin_url'    as k, count(*) filter (where linkedin_url is not null) as n from contact union all
select 'contacts without linkedin_url',      count(*) filter (where linkedin_url is null) from contact union all
select 'person rows (shadow only)',          count(*) from person union all
select 'person rows without contact_id',     count(*) from person where contact_id is null;
-- Expected: person count ≈ contacts_with_linkedin_url (may be less if two contacts share a LI url and one wins)
-- person rows without contact_id should be 0 in this ingest.

\echo ''
\echo '=== 5. contact_company expansion (D3) ==='
select 'contact_company total'                    as k, count(*) as n from contact_company union all
select 'contact_company primary=true',                 count(*) filter (where is_primary) from contact_company union all
select 'contact_company primary=false',                count(*) filter (where not is_primary) from contact_company union all
select 'contacts with a primary company',              count(*) from contact where company_id is not null union all
select 'contacts with 2+ assoc company ids',           count(*) from contact where jsonb_array_length(raw->'_engager_associated_company_ids') > 1;
-- Expected: primary=true count = contacts_with_a_primary_company.
-- primary=false count >= (contacts with 2+ assoc) but capped by how many of those extra hubspot IDs
-- resolve through external_ref.

\echo ''
\echo '=== 6. Tags (D4) ==='
select 'tag catalog size'                as k, count(*) as n from tag union all
select 'entity_tag total',                    count(*) from entity_tag union all
select 'entity_tag on contact',               count(*) from entity_tag where entity_table='contact' union all
select 'entity_tag on company',               count(*) from entity_tag where entity_table='company';
-- Tag catalog should include: distinct list_type values + marketing_contact_status values +
-- sponsor_tier values + 'key-contact' + 'customer' + 'startup' + 'summit-interest'.

select 'tag distribution (top 15)' as note;
select t.slug, count(et.*) as applied_count
  from tag t
  left join entity_tag et on et.tag_id = t.id
 group by t.slug
 order by applied_count desc
 limit 15;

\echo ''
\echo '=== 7. LinkedIn/social domain (D5) ==='
select 'linkedin_topic_tag'          as k, count(*) as n from linkedin_topic_tag union all
select 'linkedin_monitor_config',         count(*) from linkedin_monitor_config union all
select 'linkedin_post',                   count(*) from linkedin_post union all
select 'linkedin_snapshot',               count(*) from linkedin_snapshot union all
select 'social_mention',                  count(*) from social_mention union all
select 'list_binding',                    count(*) from list_binding union all
select 'list_binding with binding_ref_id',count(*) from list_binding where binding_ref_id is not null union all
select 'linkedin_monitor_config with list_binding_id', count(*) from linkedin_monitor_config where list_binding_id is not null;
-- Expected: linkedin_topic_tag=951, monitor_config=3, post=30, snapshot=15, social_mention=85,
-- list_binding=3, list_binding_with_ref=3 (all monitor bindings back-patched), monitor_config_with_binding=3.

\echo ''
\echo '=== 8. crm_status (D4) ==='
select 'crm_status total'  as k, count(*) as n from crm_status union all
select 'contacts with lead_status', count(*) from contact where lead_status is not null and trim(lead_status) <> '';
-- Expected: crm_status count = contacts_with_lead_status.

\echo ''
\echo '=== 9. activity / task ==='
select 'activity'      as k, count(*) as n from activity union all
select 'task',              count(*) from task union all
select 'ingestion_job',     count(*) from ingestion_job;
-- Expected: activity=2, task=1, ingestion_job=9 (from social_refresh_log).

\echo ''
\echo '=== 10. Lineage completeness (external_ref) ==='
select source_system, entity_table, count(*) as n
  from external_ref
 group by 1, 2
 order by 1, 2;
-- Expected (approx):
--   engager_v1 company           = 2087
--   engager_v1 contact           = 3699 (only for contacts with an email that landed in canonical)
--   engager_v1 person            = per-contact-with-linkedin
--   engager_v1 list              = 3
--   engager_v1 list_binding      = 3
--   engager_v1 linkedin_monitor_config = 3
--   engager_v1 task              = 1
--   hubspot    company           = 2087 (every company gets HubSpot lineage too)
--   hubspot    contact           = 3699 (every contact gets HubSpot lineage too)

\echo ''
\echo '=== 11. Referential integrity spot-checks ==='
-- No linkedin_post pointing to a non-existent company or person
select 'orphan linkedin_post (bad entity_id)' as k,
       count(*) as n
  from linkedin_post lp
 where (lp.entity_type='company' and not exists (select 1 from company where id = lp.entity_id))
    or (lp.entity_type='person'  and not exists (select 1 from person  where id = lp.entity_id));
-- Expected: 0

-- No contact_company pointing to a missing contact or company
select 'orphan contact_company' as k,
       count(*) as n
  from contact_company cc
 where not exists (select 1 from contact where id = cc.contact_id)
    or not exists (select 1 from company where id = cc.company_id);
-- Expected: 0

-- Every list_binding.binding_ref_id (when non-null) points to a real config
select 'orphan list_binding.binding_ref_id' as k,
       count(*) as n
  from list_binding lb
 where lb.binding_type = 'linkedin_monitor'
   and lb.binding_ref_id is not null
   and not exists (select 1 from linkedin_monitor_config where id = lb.binding_ref_id);
-- Expected: 0

\echo ''
\echo '=== 12. Sample joins (spot check) ==='
-- Show one company with everything hanging off it
select
  c.id                    as company_id,
  c.name,
  c.domain,
  (select count(*) from contact where company_id = c.id) as contacts_here,
  (select count(*) from contact_company where company_id = c.id) as cc_links,
  (select count(*) from entity_tag where entity_table='company' and entity_id = c.id) as tags,
  (select count(*) from linkedin_post where entity_type='company' and entity_id = c.id) as linkedin_posts,
  (select count(*) from linkedin_snapshot where entity_type='company' and entity_id = c.id) as linkedin_snapshots
from company c
where c.domain::text = 'salesforce.com'
limit 1;
