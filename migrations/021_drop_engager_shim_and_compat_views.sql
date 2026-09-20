-- =============================================================================
-- Migration 021 — Drop the engager staging shim and all compat views
--
-- Phase 8 Domain 8 — the final cutover.
--
-- Background
-- ----------
-- Phase 8 rewrote every code path in the IDN Sponsor CRM (aka "The Engager")
-- off the legacy Supabase-shaped compat surface (`public.<plural>` views over
-- `stg_engager.<plural>` staging tables) and onto the canonical singulars
-- (`public.<singular>` base tables, `public.v_*` canonical views). Domains
-- 1-7 completed the app-side rewrites. tsc --noEmit is clean, next build is
-- clean, and a targeted smoke test proved every rewritten query returns real
-- data against the canonical singulars.
--
-- What this migration does
-- ------------------------
-- 1. Drop the 16 compat views in `public` that shimmed the engager column
--    shape over the canonical schema.
-- 2. Drop the entire `stg_engager` schema (13 staging tables) — it exists
--    only to back the compat views. With the views gone it has zero readers.
--
-- What this migration EXPLICITLY does NOT touch
-- ---------------------------------------------
-- Canonical base tables (all 50 in `public.*` singular form) — untouched.
-- Canonical utility views that read canonical singulars (kept):
--   • public.segment            SELECT ... FROM list WHERE kind = 'segment'
--   • public.v_company          canonical projection over company
--   • public.v_contact          canonical projection over contact
--   • public.v_key_contacts     contact LEFT JOIN company where key_contact
--   • public.v_taxonomy         company grouped by macro/group/subcategory
--   • public.all_jobs           agent_run UNION ALL ingestion_job
-- pg_stat_statements + pg_stat_statements_info (extension views) — untouched.
--
-- Safety
-- ------
-- Before authoring this migration:
--   • rg over app/src/ confirmed zero code references to any doomed view or
--     to stg_engager.*
--   • pg_depend was probed: no OTHER views depend on any of the 16 doomed
--     views (drop chain terminates at each one)
--   • the only remaining stg_engager references outside the drop targets are
--     historical migrations (013_engager_compat_columns.sql etc.) and the
--     one-shot loader `scripts/load_stg_engager.py`, both non-runtime
--
-- Execution order
-- ---------------
-- Views first (they hold locks on stg_engager tables), then the schema. Each
-- DROP is idempotent (IF EXISTS) so replays are safe.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Drop the 16 compat views in public.
--    Each shimmed the engager plural-name / column shape over canonical.
-- -----------------------------------------------------------------------------
drop view if exists public.activities              cascade;  -- → activity
drop view if exists public.agent_runs              cascade;  -- → agent_run
drop view if exists public.campaign_sends          cascade;  -- → campaign_send
drop view if exists public.companies               cascade;  -- → company (via stg_engager.companies join)
drop view if exists public.contacts                cascade;  -- → contact (via stg_engager.contacts join)
drop view if exists public.enrichments             cascade;  -- → enrichment
drop view if exists public.linkedin_monitor_configs cascade; -- → linkedin_monitor_config
drop view if exists public.linkedin_posts          cascade;  -- → linkedin_post
drop view if exists public.linkedin_snapshots      cascade;  -- → linkedin_snapshot
drop view if exists public.linkedin_topic_tags     cascade;  -- → linkedin_topic_tag
drop view if exists public.list_bindings           cascade;  -- → list_binding
drop view if exists public.list_members            cascade;  -- → list_member
drop view if exists public.lists                   cascade;  -- → list (via stg_engager.lists join)
drop view if exists public.segments                cascade;  -- alias over public.segment
drop view if exists public.social_mentions         cascade;  -- → social_mention
drop view if exists public.tags                    cascade;  -- → tag
drop view if exists public.tasks                   cascade;  -- → task

-- -----------------------------------------------------------------------------
-- 2. Drop the entire staging schema.
--    Contents (all 13 base tables) were loaded once from Engager JSONL dumps
--    to seed the canonical schema; the compat views were the only readers.
--    CASCADE catches any straggler dependency (there should be none).
-- -----------------------------------------------------------------------------
drop schema if exists stg_engager cascade;

-- -----------------------------------------------------------------------------
-- 3. Post-conditions (assertion queries — will raise if a doomed object survives)
-- -----------------------------------------------------------------------------
do $$
declare
  n_views int;
  n_schema int;
begin
  select count(*) into n_views
    from information_schema.views
   where table_schema = 'public'
     and table_name in (
       'activities','agent_runs','campaign_sends','companies','contacts',
       'enrichments','linkedin_monitor_configs','linkedin_posts',
       'linkedin_snapshots','linkedin_topic_tags','list_bindings',
       'list_members','lists','segments','social_mentions','tags','tasks'
     );
  if n_views > 0 then
    raise exception 'migration 021: % compat view(s) still present after drop', n_views;
  end if;

  select count(*) into n_schema
    from information_schema.schemata
   where schema_name = 'stg_engager';
  if n_schema > 0 then
    raise exception 'migration 021: stg_engager schema still present after drop';
  end if;
end $$;

commit;
