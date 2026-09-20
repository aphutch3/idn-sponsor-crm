-- Phase 8 · Domain 6: allow one-off / transactional sends without a parent campaign.
--
-- Rationale
--   The IDN Engager app treats campaign_send as the log for both
--   campaign-driven blasts AND one-off transactional sends (Resend
--   /api/email/send with no campaign_id). The pre-cutover Supabase schema
--   had campaign_send.campaign_id nullable, and the app has always relied
--   on that. When migration 018_email_tracking.sql rebuilt the table on
--   canonical, the column was tightened to NOT NULL — which breaks the
--   /api/email/send route the moment it emits a transactional send.
--
--   Making the FK nullable is the correct schema choice: it accurately
--   models the domain (a send is anchored to a recipient, not necessarily
--   to a campaign) and mirrors real production behavior. All downstream
--   analytics that GROUP BY campaign_id already tolerate NULL — the
--   trigger rollups don't touch this column.
--
-- Effect
--   ALTER campaign_send DROP NOT NULL on campaign_id.
--   FK constraint (campaign_send.campaign_id -> campaign.id) remains.
--   No data changes; no view/enum changes.

alter table public.campaign_send
  alter column campaign_id drop not null;

comment on column public.campaign_send.campaign_id is
  'Optional parent campaign. NULL = transactional / one-off send (e.g. Engager /api/email/send with no campaign context).';
