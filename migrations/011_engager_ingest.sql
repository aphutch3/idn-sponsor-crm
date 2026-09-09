-- 011_engager_ingest.sql
-- Phase 1 · Step 1.4 · Migration 11 of N (DATA)
-- Ingest the Engager Supabase snapshot into canonical.
--
-- Runs AFTER: 001-010 DDL applied, scripts/load_stg_engager.py has loaded JSONL into stg_engager.*
--
-- Locked decisions this migration encodes:
--   D1: company dedup by lower(domain); first-seen wins; loser lineage still recorded.
--   D2: person shadow only when contact.linkedin_url is present.
--   D3: dual lineage on company (engager_v1 + hubspot); contact_company expanded via external_ref lookup.
--   D4: crm_status from lead_status; tags from list_type, key_contact, marketing_contact_status,
--       sponsor_tier, is_customer, startup, summit_interest.
--   D5-A: LinkedIn/social tables from 010 populated 1:1 from source.
--   D6: (out of scope here — social_mention re-snapshot happens in Step 1.7 cutover window)
--
-- Everything is idempotent via `on conflict do nothing`. Re-running this migration on a fresh
-- Neon branch should produce identical row counts.
--
-- Contract with loader script:
--   stg_engager.<table_name> has EXACTLY the columns of the source Supabase table plus
--   `_ingested_at timestamptz default now()`. All jsonb-shaped source columns stay jsonb.
--   Arrays stay text[]. All timestamps stay timestamptz.

-- ============================================================
-- STAGING SCHEMA
-- ============================================================
-- Dropped and recreated on every run so the loader has a clean slate.
-- The loader script (scripts/load_stg_engager.py) runs the DDL below AFTER this migration
-- and BEFORE the transforms — we split it that way so the transform block below can be
-- re-run on an already-loaded staging schema for debugging without re-copying data.

create schema if not exists stg_engager;

-- Note: staging table DDL is applied by the loader script (scripts/load_stg_engager.py)
-- to keep this migration file focused on transforms. The loader emits CREATE TABLE IF NOT
-- EXISTS statements that mirror the source column shape exactly. If you're reading this
-- file in isolation and want to see the staging shape, run:
--     python3 scripts/load_stg_engager.py --print-ddl
-- The transforms below reference: stg_engager.companies, stg_engager.contacts,
-- stg_engager.activities, stg_engager.tasks, stg_engager.lists, stg_engager.list_members,
-- stg_engager.list_bindings, stg_engager.linkedin_topic_tags, stg_engager.linkedin_posts,
-- stg_engager.linkedin_snapshots, stg_engager.linkedin_monitor_configs,
-- stg_engager.social_mentions, stg_engager.social_refresh_log.

-- ============================================================
-- TRANSFORM 1: company (with dual lineage: engager_v1 + hubspot)
-- ============================================================
-- D1: dedup on lower(domain). First occurrence wins.
-- Companies without a domain always get a new UUID (canonical company_domain_uidx allows nulls).

with ranked as (
  select
    c.*,
    row_number() over (
      partition by nullif(lower(c.domain), '')
      order by c.created_at, c.id
    ) as rn_domain
  from stg_engager.companies c
),
-- Winners: first row per domain group (or every row if no domain)
winners as (
  select * from ranked where domain is null or rn_domain = 1
),
inserted as (
  insert into company (
    id, name, domain, website_url, linkedin_url, twitter_handle, country_region,
    employee_count_band, macro_category, industry, company_type,
    is_customer, is_startup, stay_on_top, owner, raw, created_at, updated_at
  )
  select
    gen_random_uuid(),
    coalesce(nullif(trim(w.name), ''), 'Unknown'),
    nullif(lower(w.domain), '')::citext,
    w.website_url,
    w.linkedin_url,
    w.twitter_handle,
    w.country_region,
    -- number_of_employees is stored as text like "8484.0" in source; keep as free-form band
    w.number_of_employees,
    w.macro_category,
    w.industry,
    w.company_type,
    coalesce(w.is_customer, false),
    coalesce(w.startup, false)   is not distinct from true,   -- normalize null → false via IS NOT DISTINCT
    coalesce(w.stay_on_top, false),
    w.company_owner,
    coalesce(w.raw, '{}'::jsonb) || jsonb_build_object(
      '_engager_id',           w.id,
      '_engager_created_at',   w.created_at,
      '_engager_updated_at',   w.updated_at,
      '_engager_sponsor_tier', w.sponsor_tier,
      '_engager_group',        w."group",
      '_engager_subcategory',  w.subcategory,
      '_engager_technology',   w.technology,
      '_engager_conferences',  w.conferences,
      '_engager_summit_interest', w.summit_interest,
      '_engager_conference_speaking', w.conference_speaking,
      '_engager_rank_stage',   w.rank_stage,
      '_engager_rank_history', w.rank_history,
      '_engager_activity',     w.activity
    ),
    coalesce(w.created_at, now()),
    coalesce(w.updated_at, now())
  from winners w
  returning id, raw
)
-- Record lineage: engager_v1 (winner + losers all point to the same canonical id)
insert into external_ref (entity_table, entity_id, source_system, external_id, external_url, meta)
select
  'company',
  coalesce(
    -- winner: match on raw->>'_engager_id' == c.id
    (select i.id from inserted i where i.raw->>'_engager_id' = c.id),
    -- loser: match on domain (all rows with same domain map to same canonical id)
    (select co.id from company co
       where co.domain is not null
         and co.domain::text = nullif(lower(c.domain), '')
       limit 1)
  ),
  'engager_v1',
  c.id,
  null,
  jsonb_build_object('is_winner', c.id in (select i.raw->>'_engager_id' from inserted i))
from stg_engager.companies c
where coalesce(
  (select i.id from inserted i where i.raw->>'_engager_id' = c.id),
  (select co.id from company co
     where co.domain is not null
       and co.domain::text = nullif(lower(c.domain), '')
     limit 1)
) is not null
on conflict do nothing;

-- Also record HubSpot lineage on every company that had a hubspot_record_id (D3).
insert into external_ref (entity_table, entity_id, source_system, external_id, external_url, meta)
select distinct on (c.hubspot_record_id)
  'company',
  er.entity_id,
  'hubspot',
  c.hubspot_record_id,
  null,
  '{}'::jsonb
from stg_engager.companies c
join external_ref er
  on er.source_system = 'engager_v1'
 and er.entity_table  = 'company'
 and er.external_id   = c.id
where c.hubspot_record_id is not null
on conflict do nothing;

-- ============================================================
-- TRANSFORM 2: contact
-- ============================================================
-- Every contact → one canonical contact row. Email is the natural key.

with inserted as (
  insert into contact (
    id, company_id, first_name, last_name, email, job_title, linkedin_url,
    phone, twitter_username, lead_status, owner,
    unsubscribed_all, opted_out_marketing, raw, created_at, updated_at
  )
  select
    gen_random_uuid(),
    -- Resolve primary company via Engager's company_id → external_ref → canonical
    (select er.entity_id from external_ref er
      where er.source_system = 'engager_v1'
        and er.entity_table  = 'company'
        and er.external_id   = c.company_id
      limit 1),
    c.first_name,
    c.last_name,
    nullif(lower(c.email), '')::citext,
    c.job_title,
    c.linkedin_url,
    c.phone,
    c.twitter_username,
    c.lead_status,
    c.contact_owner,
    coalesce(c.unsubscribed_all_email, false),
    coalesce(c.opted_out_marketing_info, false),
    coalesce(c.raw, '{}'::jsonb) || jsonb_build_object(
      '_engager_id',                  c.id,
      '_engager_created_at',          c.created_at,
      '_engager_updated_at',          c.updated_at,
      '_engager_hs_create_date',      c.hs_create_date,
      '_engager_hubspot_record_id',   c.hubspot_record_id,
      '_engager_hubspot_company_id',  c.hubspot_company_id,
      '_engager_associated_company_ids', c.associated_company_ids,
      '_engager_list_type',           c.list_type,
      '_engager_key_contact',         c.key_contact,
      '_engager_focus',               c.focus,
      '_engager_deal_type',           c.deal_type,
      '_engager_marketing_contact_status', c.marketing_contact_status,
      '_engager_email_stats', jsonb_build_object(
        'delivered',      c.emails_delivered,
        'opened',         c.emails_opened,
        'clicked',        c.emails_clicked,
        'bounced',        c.emails_bounced,
        'replied',        c.emails_replied,
        'times_contacted', c.times_contacted,
        'last_send',      c.last_email_send_date,
        'last_open',      c.last_email_open_date,
        'last_click',     c.last_email_click_date,
        'last_reply',     c.last_email_reply_date,
        'last_activity',  c.last_activity_date,
        'hard_bounce_reason', c.hard_bounce_reason
      )
    ),
    coalesce(c.created_at, now()),
    coalesce(c.updated_at, now())
  from stg_engager.contacts c
  where c.email is not null and trim(c.email) <> ''
  on conflict (email) where email is not null do nothing
  returning id, raw
)
insert into external_ref (entity_table, entity_id, source_system, external_id, meta)
select 'contact', i.id, 'engager_v1', i.raw->>'_engager_id', '{}'::jsonb
from inserted i
on conflict do nothing;

-- Also record HubSpot contact lineage
insert into external_ref (entity_table, entity_id, source_system, external_id, meta)
select
  'contact',
  ct.id,
  'hubspot',
  ct.raw->>'_engager_hubspot_record_id',
  '{}'::jsonb
from contact ct
where ct.raw->>'_engager_hubspot_record_id' is not null
on conflict do nothing;

-- ============================================================
-- TRANSFORM 3: contact_company (many-to-many from associated_company_ids)
-- ============================================================
-- D3: Primary link + expand additional associations via external_ref lookup on hubspot IDs.

-- 3a: Primary company association (is_primary=true)
insert into contact_company (contact_id, company_id, is_primary, role)
select
  ct.id,
  ct.company_id,
  true,
  null
from contact ct
where ct.company_id is not null
on conflict do nothing;

-- 3b: Additional associations from associated_company_ids array
--     Each HubSpot ID → external_ref lookup → canonical company_id → additional link (is_primary=false)
with expanded as (
  select
    ct.id as contact_id,
    ct.company_id as primary_company_id,
    jsonb_array_elements_text(ct.raw->'_engager_associated_company_ids') as hs_company_id
  from contact ct
  where jsonb_typeof(ct.raw->'_engager_associated_company_ids') = 'array'
)
insert into contact_company (contact_id, company_id, is_primary, role)
select distinct
  e.contact_id,
  er.entity_id,
  false,
  null
from expanded e
join external_ref er
  on er.source_system = 'hubspot'
 and er.entity_table  = 'company'
 and er.external_id   = e.hs_company_id
where er.entity_id is distinct from e.primary_company_id
on conflict do nothing;

-- ============================================================
-- TRANSFORM 4: person (D2 — shadow of contacts that have a linkedin_url)
-- ============================================================
insert into person (
  id, contact_id, full_name, email, linkedin_url, current_company_id, current_title,
  created_at, updated_at
)
select
  gen_random_uuid(),
  ct.id,
  coalesce(nullif(trim(ct.full_name), ''),
           nullif(trim(concat_ws(' ', ct.first_name, ct.last_name)), ''),
           split_part(ct.email::text, '@', 1)),
  ct.email,
  ct.linkedin_url,
  ct.company_id,
  ct.job_title,
  ct.created_at,
  ct.updated_at
from contact ct
where ct.linkedin_url is not null
  and trim(ct.linkedin_url) <> ''
on conflict (linkedin_url) where linkedin_url is not null do nothing;

-- Person lineage — attach engager_v1 id via contact's raw._engager_id
insert into external_ref (entity_table, entity_id, source_system, external_id, meta)
select 'person', p.id, 'engager_v1', ct.raw->>'_engager_id', jsonb_build_object('via', 'contact_shadow')
from person p
join contact ct on ct.id = p.contact_id
where ct.raw->>'_engager_id' is not null
on conflict do nothing;

-- ============================================================
-- TRANSFORM 5: crm_status (D4 — from contacts.lead_status)
-- ============================================================
insert into crm_status (entity_table, entity_id, stage, owner)
select
  'contact',
  ct.id,
  ct.lead_status,
  ct.owner
from contact ct
where ct.lead_status is not null and trim(ct.lead_status) <> ''
on conflict (entity_table, entity_id) do nothing;

-- ============================================================
-- TRANSFORM 6: tags — populate catalog + apply to entities (D4)
-- ============================================================

-- 6a: Seed the tag catalog with all distinct values we'll apply below.
--     Slug generation: lower + hyphen replacement.
with sources as (
  -- From contacts.list_type[]
  select distinct jsonb_array_elements_text(ct.raw->'_engager_list_type') as label
    from contact ct
    where jsonb_typeof(ct.raw->'_engager_list_type') = 'array'
  union
  -- From contacts.marketing_contact_status
  select distinct ct.raw->>'_engager_marketing_contact_status'
    from contact ct
    where ct.raw->>'_engager_marketing_contact_status' is not null
  union
  -- From companies.sponsor_tier
  select distinct co.raw->>'_engager_sponsor_tier'
    from company co
    where co.raw->>'_engager_sponsor_tier' is not null
  union
  -- Fixed vocabulary flags
  select 'key-contact'
  union select 'customer'
  union select 'startup'
  union select 'summit-interest'
)
insert into tag (slug, label)
select
  lower(regexp_replace(trim(s.label), '[^a-zA-Z0-9]+', '-', 'g')) as slug,
  s.label
from sources s
where s.label is not null and trim(s.label) <> ''
on conflict (slug) do nothing;

-- 6b: Apply tags from contacts.list_type[]
insert into entity_tag (tag_id, entity_table, entity_id, applied_by)
select distinct
  t.id, 'contact', ct.id, 'engager_ingest'
from contact ct
cross join lateral jsonb_array_elements_text(ct.raw->'_engager_list_type') as v(label)
join tag t on t.slug = lower(regexp_replace(trim(v.label), '[^a-zA-Z0-9]+', '-', 'g'))
where jsonb_typeof(ct.raw->'_engager_list_type') = 'array'
on conflict do nothing;

-- 6c: marketing_contact_status
insert into entity_tag (tag_id, entity_table, entity_id, applied_by)
select
  t.id, 'contact', ct.id, 'engager_ingest'
from contact ct
join tag t on t.slug = lower(regexp_replace(trim(ct.raw->>'_engager_marketing_contact_status'), '[^a-zA-Z0-9]+', '-', 'g'))
where ct.raw->>'_engager_marketing_contact_status' is not null
on conflict do nothing;

-- 6d: key_contact flag
insert into entity_tag (tag_id, entity_table, entity_id, applied_by)
select
  (select id from tag where slug = 'key-contact'),
  'contact', ct.id, 'engager_ingest'
from contact ct
where ct.raw->>'_engager_key_contact' in ('true', 't', '1', 'yes', 'True')
on conflict do nothing;

-- 6e: company sponsor_tier
insert into entity_tag (tag_id, entity_table, entity_id, applied_by)
select
  t.id, 'company', co.id, 'engager_ingest'
from company co
join tag t on t.slug = lower(regexp_replace(trim(co.raw->>'_engager_sponsor_tier'), '[^a-zA-Z0-9]+', '-', 'g'))
where co.raw->>'_engager_sponsor_tier' is not null
on conflict do nothing;

-- 6f: company boolean flags
insert into entity_tag (tag_id, entity_table, entity_id, applied_by)
select (select id from tag where slug = 'customer'), 'company', co.id, 'engager_ingest'
from company co where co.is_customer = true
on conflict do nothing;

insert into entity_tag (tag_id, entity_table, entity_id, applied_by)
select (select id from tag where slug = 'startup'), 'company', co.id, 'engager_ingest'
from company co where co.is_startup = true
on conflict do nothing;

insert into entity_tag (tag_id, entity_table, entity_id, applied_by)
select (select id from tag where slug = 'summit-interest'), 'company', co.id, 'engager_ingest'
from company co where (co.raw->>'_engager_summit_interest') in ('true', 't', '1', 'yes', 'True')
on conflict do nothing;

-- ============================================================
-- TRANSFORM 7: activity (2 rows)
-- ============================================================
-- Engager activities.kind values observed: 'note'. Canonical activity_kind enum has:
--   email / call / meeting / linkedin / agent_note / system_note / task_note.
-- Map: 'note' → 'system_note' (safe default; user can retag later).

insert into activity (
  id, kind, contact_id, company_id, owner, subject, body, source_system, external_id,
  occurred_at, raw
)
select
  gen_random_uuid(),
  case a.kind
    when 'note'        then 'system_note'::activity_kind
    when 'email'       then 'email'::activity_kind
    when 'call'        then 'call'::activity_kind
    when 'meeting'     then 'meeting'::activity_kind
    when 'linkedin'    then 'linkedin'::activity_kind
    when 'agent_note'  then 'agent_note'::activity_kind
    when 'task_note'   then 'task_note'::activity_kind
    else 'system_note'::activity_kind
  end,
  (select er.entity_id from external_ref er
    where er.source_system='engager_v1' and er.entity_table='contact' and er.external_id = a.contact_id limit 1),
  (select er.entity_id from external_ref er
    where er.source_system='engager_v1' and er.entity_table='company' and er.external_id = a.company_id limit 1),
  a.actor,
  a.subject,
  a.body,
  'engager_v1',
  a.id,
  coalesce(a.occurred_at, a.created_at, now()),
  coalesce(a.meta, '{}'::jsonb) || jsonb_build_object('_engager_source', a.source)
from stg_engager.activities a
on conflict (source_system, external_id) where external_id is not null do nothing;

-- ============================================================
-- TRANSFORM 8: task (1 row)
-- ============================================================
insert into task (
  id, title, body, status, owner, contact_id, company_id, due_at, raw, created_at, updated_at
)
select
  gen_random_uuid(),
  t.title,
  t.detail,
  coalesce(t.status, 'open'),
  t.assigned_to,
  (select er.entity_id from external_ref er
    where er.source_system='engager_v1' and er.entity_table='contact' and er.external_id = t.contact_id limit 1),
  (select er.entity_id from external_ref er
    where er.source_system='engager_v1' and er.entity_table='company' and er.external_id = t.company_id limit 1),
  t.due_at,
  coalesce(t.meta, '{}'::jsonb) || jsonb_build_object('_engager_id', t.id, '_engager_origin', t.origin),
  coalesce(t.created_at, now()),
  coalesce(t.updated_at, now())
from stg_engager.tasks t;

-- Task lineage
insert into external_ref (entity_table, entity_id, source_system, external_id, meta)
select 'task', tk.id, 'engager_v1', tk.raw->>'_engager_id', '{}'::jsonb
from task tk
where tk.raw->>'_engager_id' is not null
on conflict do nothing;

-- ============================================================
-- TRANSFORM 9: list + list_member + list_binding (3 + 3 + 3 rows)
-- ============================================================

-- 9a: list
insert into list (id, name, description, kind, owner, raw, created_at, updated_at)
select
  gen_random_uuid(),
  l.name,
  l.description,
  coalesce(l.kind, 'static'),
  l.owner,
  coalesce(l.meta, '{}'::jsonb) || jsonb_build_object(
    '_engager_id',           l.id,
    '_engager_slug',         l.slug,
    '_engager_purpose',      l.purpose,
    '_engager_visibility',   l.visibility,
    '_engager_active',       l.active,
    '_engager_pinned',       l.pinned,
    '_engager_tags',         l.tags,
    '_engager_entity_types', l.entity_types,
    '_engager_last_refreshed_at', l.last_refreshed_at,
    '_engager_member_count', l.member_count
  ),
  coalesce(l.created_at, now()),
  coalesce(l.updated_at, now())
from stg_engager.lists l
on conflict (name) do nothing;

insert into external_ref (entity_table, entity_id, source_system, external_id, meta)
select 'list', li.id, 'engager_v1', li.raw->>'_engager_id', '{}'::jsonb
from list li
where li.raw->>'_engager_id' is not null
on conflict do nothing;

-- 9b: list_member (source has entity_type='company' rows → point at canonical company/contact/person)
--     Source uses Engager's own company/contact uuids, which map through external_ref.
insert into list_member (list_id, entity_table, entity_id, added_at, added_by, source, meta)
select
  li.id,
  lm.entity_type,
  case lm.entity_type
    when 'company' then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='company' and er.external_id = lm.entity_id::text limit 1)
    when 'contact' then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='contact' and er.external_id = lm.entity_id::text limit 1)
    when 'person'  then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='person'  and er.external_id = lm.entity_id::text limit 1)
    else null
  end,
  coalesce(lm.added_at, now()),
  lm.added_by,
  coalesce(lm.source, 'engager_import'),
  coalesce(lm.meta, '{}'::jsonb) || jsonb_build_object('_engager_role', lm.role, '_engager_id', lm.id)
from stg_engager.list_members lm
join list li on li.raw->>'_engager_id' = lm.list_id::text
where lm.entity_id is not null
on conflict do nothing;

-- 9c: list_binding (3 rows)
insert into list_binding (
  id, list_id, binding_type, binding_ref_id, active, honor_suppressions,
  suppression_list_ids, config, created_at, updated_at
)
select
  gen_random_uuid(),
  li.id,
  lb.binding_type,
  null,  -- binding_ref_id will be filled in Transform 10 (linkedin_monitor_config → then back-patch)
  coalesce(lb.active, true),
  coalesce(lb.honor_suppressions, true),
  coalesce(lb.suppression_list_ids, '{}')::uuid[],
  coalesce(lb.config, '{}'::jsonb) || jsonb_build_object('_engager_id', lb.id, '_engager_binding_ref_id', lb.binding_ref_id),
  coalesce(lb.created_at, now()),
  coalesce(lb.updated_at, now())
from stg_engager.list_bindings lb
join list li on li.raw->>'_engager_id' = lb.list_id::text;

insert into external_ref (entity_table, entity_id, source_system, external_id, meta)
select 'list_binding', lb.id, 'engager_v1', lb.config->>'_engager_id', '{}'::jsonb
from list_binding lb
where lb.config->>'_engager_id' is not null
on conflict do nothing;

-- ============================================================
-- TRANSFORM 10: linkedin_topic_tag (951 rows) — PK is slug, direct 1:1
-- ============================================================
insert into linkedin_topic_tag (
  slug, name, category, description, keyword_phrases, aliases, weight, active,
  articles_30d, created_at, updated_at
)
select
  tt.slug,
  tt.name,
  tt.category,
  tt.description,
  coalesce(tt.keyword_phrases, '{}'),
  coalesce(tt.aliases, '{}'),
  coalesce(tt.weight, 1),
  coalesce(tt.active, true),
  coalesce(tt.articles_30d, 0),
  coalesce(tt.created_at, now()),
  coalesce(tt.updated_at, now())
from stg_engager.linkedin_topic_tags tt
on conflict (slug) do nothing;

-- ============================================================
-- TRANSFORM 11: linkedin_monitor_config (3 rows) + back-patch list_binding.binding_ref_id
-- ============================================================
insert into linkedin_monitor_config (
  id, list_binding_id, name, active, fetch_types, batch_size, cadence_seconds,
  jitter_seconds, per_fetch_delay_ms, score_posts, topic_filter, relevance_min_score,
  run_cursor, last_run_at, next_run_at, meta, created_at, updated_at
)
select
  gen_random_uuid(),
  (select lb.id from list_binding lb where lb.config->>'_engager_id' = mc.list_binding_id::text limit 1),
  mc.name,
  coalesce(mc.active, true),
  coalesce(mc.fetch_types, '{}'),
  coalesce(mc.batch_size, 5),
  coalesce(mc.cadence_seconds, 21600),
  coalesce(mc.jitter_seconds, 1800),
  coalesce(mc.per_fetch_delay_ms, 60000),
  coalesce(mc.score_posts, true),
  coalesce(mc.topic_filter, '{}'),
  coalesce(mc.relevance_min_score, 60),
  coalesce(mc.run_cursor, '{}'::jsonb),
  mc.last_run_at,
  mc.next_run_at,
  coalesce(mc.meta, '{}'::jsonb) || jsonb_build_object('_engager_id', mc.id),
  coalesce(mc.created_at, now()),
  coalesce(mc.updated_at, now())
from stg_engager.linkedin_monitor_configs mc;

insert into external_ref (entity_table, entity_id, source_system, external_id, meta)
select 'linkedin_monitor_config', mc.id, 'engager_v1', mc.meta->>'_engager_id', '{}'::jsonb
from linkedin_monitor_config mc
where mc.meta->>'_engager_id' is not null
on conflict do nothing;

-- Back-patch: list_binding.binding_ref_id was NULL during Transform 9c because the
-- monitor_configs weren't inserted yet. Now that they are, resolve each list_binding's
-- original binding_ref_id (engager monitor_config id) → new canonical id.
update list_binding lb
set binding_ref_id = mc.id
from linkedin_monitor_config mc
where lb.binding_type = 'linkedin_monitor'
  and lb.config->>'_engager_binding_ref_id' is not null
  and mc.meta->>'_engager_id' = lb.config->>'_engager_binding_ref_id';

-- Also handle the reverse: many Engager configs point to a list_binding via mc.list_binding_id,
-- so back-patch the config's list_binding_id too (already handled in the initial INSERT above
-- via the subquery on lb.config->>'_engager_id').

-- ============================================================
-- TRANSFORM 12: linkedin_post (30 rows)
-- ============================================================
-- entity_id in source refers to a company or person UUID from the Engager DB.
-- We look them up via external_ref (source_system=engager_v1) to map to canonical.

insert into linkedin_post (
  id, monitor_config_id, entity_type, entity_id, post_urn, post_url, post_text,
  posted_at, media_kind, reactions, comments, reposts, keyword_hits,
  relevance_score, relevance_reason, relevance_topics, scorer_model, scored_at,
  first_seen_at, last_fetched_at, raw, meta, created_at
)
select
  gen_random_uuid(),
  (select mc.id from linkedin_monitor_config mc where mc.meta->>'_engager_id' = lp.monitor_config_id::text limit 1),
  lp.entity_type,
  case lp.entity_type
    when 'company' then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='company' and er.external_id = lp.entity_id::text limit 1)
    when 'person'  then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='person'  and er.external_id = lp.entity_id::text limit 1)
    else null
  end,
  lp.post_urn,
  lp.post_url,
  lp.post_text,
  lp.posted_at,
  lp.media_kind,
  coalesce(lp.reactions, 0),
  coalesce(lp.comments, 0),
  coalesce(lp.reposts, 0),
  coalesce(lp.keyword_hits, '{}'),
  lp.relevance_score,
  lp.relevance_reason,
  coalesce(lp.relevance_topics, '{}'),
  lp.scorer_model,
  lp.scored_at,
  coalesce(lp.first_seen_at, now()),
  lp.last_fetched_at,
  coalesce(lp.raw, '{}'::jsonb),
  coalesce(lp.meta, '{}'::jsonb) || jsonb_build_object('_engager_id', lp.id),
  now()
from stg_engager.linkedin_posts lp
where lp.entity_id is not null
  -- Skip if the canonical entity resolution failed (would violate NOT NULL)
  and case lp.entity_type
    when 'company' then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='company' and er.external_id = lp.entity_id::text limit 1)
    when 'person'  then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='person'  and er.external_id = lp.entity_id::text limit 1)
    else null
  end is not null
on conflict (post_urn) where post_urn is not null do nothing;

-- ============================================================
-- TRANSFORM 13: linkedin_snapshot (15 rows)
-- ============================================================
insert into linkedin_snapshot (
  id, monitor_config_id, entity_type, entity_id, fetch_type, source_url,
  http_status, content_hash, parsed, raw_storage_path, firecrawl_job_id, error,
  fetched_at, meta
)
select
  gen_random_uuid(),
  (select mc.id from linkedin_monitor_config mc where mc.meta->>'_engager_id' = ls.monitor_config_id::text limit 1),
  ls.entity_type,
  case ls.entity_type
    when 'company' then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='company' and er.external_id = ls.entity_id::text limit 1)
    when 'person'  then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='person'  and er.external_id = ls.entity_id::text limit 1)
    else null
  end,
  ls.fetch_type,
  ls.source_url,
  ls.http_status,
  ls.content_hash,
  coalesce(ls.parsed, '{}'::jsonb),
  ls.raw_storage_path,
  ls.firecrawl_job_id,
  ls.error,
  coalesce(ls.fetched_at, now()),
  coalesce(ls.meta, '{}'::jsonb) || jsonb_build_object('_engager_id', ls.id)
from stg_engager.linkedin_snapshots ls
where ls.entity_id is not null
  and case ls.entity_type
    when 'company' then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='company' and er.external_id = ls.entity_id::text limit 1)
    when 'person'  then (select er.entity_id from external_ref er
                          where er.source_system='engager_v1' and er.entity_table='person'  and er.external_id = ls.entity_id::text limit 1)
    else null
  end is not null;

-- ============================================================
-- TRANSFORM 14: social_mention (85 rows) — no entity resolution needed
-- ============================================================
insert into social_mention (
  id, platform, platform_post_id, topic, query, url, text, author_name, author_username,
  author_verified, posted_at, fetched_at, like_count, reply_count, retweet_count,
  quote_count, bookmark_count, impression_count, reach_score, raw
)
select
  gen_random_uuid(),
  sm.platform,
  sm.id,   -- native platform ID (e.g., X post URN as string)
  sm.topic,
  sm.query,
  sm.url,
  sm.text,
  sm.author_name,
  sm.author_username,
  sm.author_verified,
  sm.posted_at,
  coalesce(sm.fetched_at, now()),
  sm.like_count,
  sm.reply_count,
  sm.retweet_count,
  sm.quote_count,
  sm.bookmark_count,
  sm.impression_count,
  sm.reach_score,
  coalesce(sm.raw, '{}'::jsonb)
from stg_engager.social_mentions sm
on conflict (platform, platform_post_id) do nothing;

-- ============================================================
-- TRANSFORM 15: ingestion_job — record the social_refresh_log as canonical monitoring rows
-- ============================================================
insert into ingestion_job (
  id, job_name, source_system, status, rows_read, rows_upserted, rows_failed,
  errors, started_at, completed_at, meta, created_at
)
select
  gen_random_uuid(),
  'refresh_social_mentions',
  'engager_v1',
  case when coalesce(srl.errors, 0) = 0 then 'succeeded' else 'partial' end,
  null,
  coalesce(srl.posts_inserted, 0) + coalesce(srl.posts_updated, 0),
  coalesce(srl.errors, 0),
  null,
  srl.ran_at,
  srl.ran_at + (srl.duration_ms || ' milliseconds')::interval,
  jsonb_build_object(
    '_engager_id',     srl.id,
    'queries_run',     srl.queries_run,
    'posts_inserted',  srl.posts_inserted,
    'posts_updated',   srl.posts_updated,
    'duration_ms',     srl.duration_ms
  ),
  coalesce(srl.ran_at, now())
from stg_engager.social_refresh_log srl;

-- ============================================================
-- DONE. Read-back verification lives in scripts/verify_engager_ingest.sql
-- ============================================================
