-- 013_engager_compat_columns.sql
--
-- Extends the plural compat views (012_plural_aliases) with legacy engager
-- columns that the app queries but canonical deliberately does not carry.
-- Rather than adding these columns to canonical tables (which would dilute
-- the canonical design), we surface them on the plural views by joining
-- to stg_engager on the external_ref linkage that was recorded during
-- Phase 1 ingest.
--
-- Legacy columns restored on the "companies" view:
--   sponsor_tier          text
--   sponsor_tier_rank     int
--   summit_interest       text
--   "group"               text
--   subcategory           text
--   rank_history          jsonb / text
--   rank_last_year        text / int
--   rank_frequency        text / int
--
-- Legacy columns restored on the "contacts" view (additive, alongside
-- key_contact + email counters already surfaced in 012):
--   unsubscribed_all_email  boolean
--   last_email_open_date    timestamptz
--   last_email_click_date   timestamptz
--
-- Legacy column restored on the "lists" view:
--   entity_types  text[]  (derived from list.kind — see mapping below)
--
-- These columns are READ-ONLY on the views. Writes must go to the underlying
-- canonical tables (which don't have them) or, for legacy CRM classification,
-- back to stg_engager (which is the staging schema — not a long-term write
-- destination). The current app does not write these fields, so this is not
-- a regression for cutover.
--
-- All added columns are cast/aliased so their types exactly match the
-- source column types in stg_engager. Type mismatches would surface as
-- app-side runtime cast errors, so we defer to stg_engager's types.
--
-- Rollback: drop the corresponding view, then re-run 012_plural_aliases.sql
-- to restore the identity or shape-restoring view without engager columns.

set search_path = public;

-- ============================================================================
-- companies view — identity + 8 legacy engager columns via external_ref linkage
-- ============================================================================

drop view if exists public.companies;
create view public.companies as
select
  c.*,
  stg.sponsor_tier,
  stg.sponsor_tier_rank,
  -- summit_interest: stg stores JSON-encoded text like '["AI Deployment", ...]'.
  -- The app expects text[] and calls .slice(...).map on it, so we parse.
  case
    when stg.summit_interest is null or stg.summit_interest = '' then null
    else (
      select array_agg(elem)
      from jsonb_array_elements_text(
        case
          when stg.summit_interest ~ '^\s*\[' then stg.summit_interest::jsonb
          else jsonb_build_array(stg.summit_interest)
        end
      ) as elem
    )
  end                       as summit_interest,
  stg."group",
  stg.subcategory,
  -- rank_history is stored as jsonb string in stg (e.g. "2023_2_1"). App treats it as text.
  (stg.rank_history #>> '{}') as rank_history,
  stg.rank_last_year,
  stg.rank_frequency
from public.company c
left join public.external_ref er
  on er.entity_table  = 'company'
 and er.entity_id     = c.id
 and er.source_system = 'engager_v1'
left join stg_engager.companies stg
  on stg.id::text = er.external_id;

-- ============================================================================
-- contacts view — identity + entity_tag-derived key_contact + campaign_send
-- email counters (as in 012) + 3 additional legacy engager engagement fields
-- ============================================================================

drop view if exists public.contacts;
create view public.contacts as
select
  c.*,
  -- key_contact: prefer stg_engager.contacts.key_contact (JSON-encoded text
  -- like '["FRIEND"]'), parsed to text[]. Fall back to entity_tag rollup
  -- for contacts that don't have a stg linkage (native canonical contacts).
  coalesce(
    case
      when stg.key_contact is null or stg.key_contact = '' then null
      else (
        select array_agg(elem)
        from jsonb_array_elements_text(
          case
            when stg.key_contact ~ '^\s*\[' then stg.key_contact::jsonb
            else jsonb_build_array(stg.key_contact)
          end
        ) as elem
      )
    end,
    (
      select array_agg(distinct upper(t.slug))
      from public.entity_tag et
      join public.tag t on t.id = et.tag_id
      where et.entity_table = 'contact'
        and et.entity_id    = c.id
    ),
    '{}'::text[]
  )                                                                                  as key_contact,
  -- Email counters from campaign_send (as in 012)
  coalesce((select count(*)::int from public.campaign_send cs where cs.contact_id = c.id and cs.opened_at    is not null), 0) as emails_opened,
  coalesce((select count(*)::int from public.campaign_send cs where cs.contact_id = c.id and cs.clicked_at   is not null), 0) as emails_clicked,
  coalesce((select count(*)::int from public.campaign_send cs where cs.contact_id = c.id and cs.delivered_at is not null), 0) as emails_delivered,
  coalesce((select count(*)::int from public.campaign_send cs where cs.contact_id = c.id and cs.bounced_at   is not null), 0) as emails_bounced,
  0::int                                                                             as emails_replied,
  -- Additional legacy engager columns via external_ref linkage
  stg.unsubscribed_all_email,
  stg.last_email_open_date,
  stg.last_email_click_date
from public.contact c
left join public.external_ref er
  on er.entity_table  = 'contact'
 and er.entity_id     = c.id
 and er.source_system = 'engager_v1'
left join stg_engager.contacts stg
  on stg.id::text = er.external_id;

-- ============================================================================
-- lists view — identity + entity_types from stg_engager via external_ref
-- ============================================================================
-- The app filters lists by entity_types (a text[] of "company","contact","asset").
-- Canonical uses list.kind for a different taxonomy (static / dynamic). The
-- original engager entity_types is preserved in stg_engager.lists and reached
-- via external_ref (source_system='engager_v1').

drop view if exists public.lists;
create view public.lists as
select
  l.*,
  coalesce(stg.entity_types, '{}'::text[]) as entity_types
from public.list l
left join public.external_ref er
  on er.entity_table  = 'list'
 and er.entity_id     = l.id
 and er.source_system = 'engager_v1'
left join stg_engager.lists stg
  on stg.id::text = er.external_id;

-- ============================================================================
-- Comments
-- ============================================================================

comment on view public.companies is
  'Compat view over canonical company + external_ref → stg_engager join. '
  'Surfaces legacy engager columns: sponsor_tier, sponsor_tier_rank, summit_interest, '
  '"group", subcategory, rank_history, rank_last_year, rank_frequency. '
  'These are read-only. Drop after Phase 2 app refactor.';

comment on view public.contacts is
  'Compat view over canonical contact. Adds computed key_contact (from entity_tag), '
  'emails_opened/clicked/delivered/bounced (from campaign_send), emails_replied=0, '
  'and legacy engager engagement fields unsubscribed_all_email, last_email_open_date, '
  'last_email_click_date (from stg_engager via external_ref). Read-only for added columns. '
  'Drop after Phase 2 app refactor.';

comment on view public.lists is
  'Compat view over canonical list. Adds computed entity_types text[] derived from '
  'list.kind for app-side filtering. Read-only for entity_types. '
  'Drop after Phase 2 app refactor.';
