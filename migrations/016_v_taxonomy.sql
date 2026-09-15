-- 016_v_taxonomy.sql
--
-- Restore the v_taxonomy view that /start?tab=marketplace (the former Taxonomy
-- page) queries to render the three cascading columns
-- Macro Category → Group → Subcategory.
--
-- Background:
--   The 012_plural_aliases README explicitly listed v_taxonomy as
--   "not covered (missing from canonical, will show empty states in the app)".
--   That empty state is why the Marketplace tab's three columns all read
--   "Select a parent to browse" post-cutover — the panel receives zero rows
--   from public.v_taxonomy and its `macros` object is empty, so no column
--   is populated and no drill-down auto-selects.
--
-- Contract expected by app/src/components/start-panels/marketplace-panel.tsx:
--   select macro_category, "group", subcategory, company_count from v_taxonomy
--
-- Definition:
--   The `companies` compat view (013_engager_compat_columns) already exposes
--   macro_category (from canonical public.company) plus "group" and
--   subcategory (joined from stg_engager). Aggregating the same view keeps
--   taxonomy counts identical to what the Marketplace table renders below
--   the columns, and inherits every downstream companies view change for
--   free (including future entity-resolution rewrites).
--
--   Rows with a null macro_category are excluded (13 of 2,087 as of
--   2026-09-15). Null groups/subs are kept — the panel folds them into "—".
--
-- Idempotent:
--   `create or replace view` — safe to re-run.
--
-- Rollback:
--   drop view if exists public.v_taxonomy;

set search_path = public;

create or replace view public.v_taxonomy as
select
  macro_category,
  "group",
  subcategory,
  count(*)::int as company_count
from public.companies
where macro_category is not null
group by 1, 2, 3;
