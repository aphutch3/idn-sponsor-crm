-- Phase 8 · Step 4 — Read views the Engager app depends on.
-- All non-updatable (read-only) — app never writes through these.

-- ============================================================================
-- v_key_contacts — one row per contact with company_name + rolled-up email
-- engagement metrics. Matches the exact column set the Engager app selects
-- in app/src/lib/lists/list-details.ts and app/src/app/api/key-contacts/route.ts.
-- ============================================================================

create or replace view public.v_key_contacts as
select
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  c.job_title,
  c.key_contact,
  c.lead_status,
  co.name           as company_name,
  co.id             as company_id,
  co.sponsor_tier,
  coalesce(engage.opens,    0)  as emails_opened,
  coalesce(engage.clicks,   0)  as emails_clicked,
  coalesce(engage.replies,  0)  as emails_replied,
  engage.last_send_at            as last_email_send_date,
  c.unsubscribed_all_email
from public.contact c
left join public.company co on co.id = c.company_id
left join lateral (
  select
    coalesce(sum(cs.opens), 0)    as opens,
    coalesce(sum(cs.clicks), 0)   as clicks,
    0                             as replies,   -- reply tracking not yet wired; keep column shape
    max(cs.sent_at)               as last_send_at
  from public.campaign_send cs
  where cs.contact_id = c.id
) engage on true
where c.key_contact is not null
  and array_length(c.key_contact, 1) > 0;


-- ============================================================================
-- segment — view over list where kind='segment'. App treats segments as a
-- specialized flavor of list. Writable insertions go directly to public.list
-- with kind='segment'.
-- ============================================================================

create or replace view public.segment as
select id, name, description, owner, filter, member_count, raw, created_at, updated_at,
       entity_types, last_refreshed_at
from public.list
where kind = 'segment';

-- Also add plural compat alias since app selects .from('segments').
create or replace view public.segments as
select * from public.segment;


-- ============================================================================
-- v_contact — denormalized contact + company for list-display screens.
-- Matches column set from app/src/lib/contacts/queries.ts and various admin pages.
-- ============================================================================

create or replace view public.v_contact as
select
  c.id,
  c.first_name,
  c.last_name,
  c.full_name,
  c.email,
  c.job_title,
  c.linkedin_url,
  c.phone,
  c.twitter_username,
  c.lead_status,
  c.owner,
  c.key_contact,
  c.unsubscribed_all,
  c.unsubscribed_all_email,
  c.last_email_open_date,
  c.last_email_click_date,
  c.last_activity_date,
  c.emails_replied,
  c.company_id,
  co.name             as company_name,
  co.website_url      as company_website,
  co.domain           as company_domain,
  co.sponsor_tier     as company_sponsor_tier,
  co.sponsor_tier_rank as company_sponsor_tier_rank,
  co."group"          as company_group,
  co.subcategory      as company_subcategory,
  c.created_at,
  c.updated_at
from public.contact c
left join public.company co on co.id = c.company_id;


-- ============================================================================
-- v_company — company + rollup counts (contact count, latest signal, etc.)
-- ============================================================================

create or replace view public.v_company as
select
  co.*,
  coalesce(ct.contact_count, 0) as contact_count,
  ls.latest_signal_at
from public.company co
left join lateral (
  select count(*) as contact_count from public.contact where company_id = co.id
) ct on true
left join lateral (
  select max(created_at) as latest_signal_at from public.linkedin_signal
  where entity_type = 'company' and entity_id = co.id
) ls on true;
