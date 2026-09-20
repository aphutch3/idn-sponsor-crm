-- Phase 8 · Step 6 — Bring public.v_contact into shape parity with the branch.
--
-- The earlier 019 migration authored one column set, but the branch's live
-- v_contact has since accreted additional columns the app now selects:
--   - full_name (COALESCEd with first/last)
--   - last_email_send_date
--   - emails_delivered
--   - emails_opened
--   - emails_clicked
--
-- This is the exact def running on branch, replicated for prod. Uses
-- drop+create rather than create-or-replace because column count changes.

drop view if exists public.v_contact cascade;

create view public.v_contact as
select
  c.id,
  c.first_name,
  c.last_name,
  coalesce(c.full_name, trim(both from concat(c.first_name, ' ', c.last_name))) as full_name,
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
  c.last_email_send_date,
  c.last_activity_date,
  c.emails_delivered,
  c.emails_opened,
  c.emails_clicked,
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
