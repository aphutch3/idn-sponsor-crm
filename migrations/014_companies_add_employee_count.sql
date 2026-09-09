-- 014_companies_add_employee_count.sql
--
-- Adds `number_of_employees` to the `companies` compat view. The /companies
-- page selects this column; without it the whole select throws
-- ("column number_of_employees does not exist"), which surfaces as the
-- header "0 total" regression (data=null, count=null bubble up from the
-- shim's execute() catch).
--
-- Source: stg_engager.companies.number_of_employees (text, raw values
-- like "30.0"). Canonical has a nicer employee_count_band column; we surface
-- the raw stg value verbatim as `number_of_employees` for read compat.
--
-- Rollback: re-run 013_engager_compat_columns.sql (idempotent).

set search_path = public;

drop view if exists public.companies;
create view public.companies as
select
  c.*,
  stg.sponsor_tier,
  stg.sponsor_tier_rank,
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
  end                         as summit_interest,
  stg."group",
  stg.subcategory,
  (stg.rank_history #>> '{}') as rank_history,
  stg.rank_last_year,
  stg.rank_frequency,
  stg.number_of_employees
from public.company c
left join public.external_ref er
  on er.entity_table  = 'company'
 and er.entity_id     = c.id
 and er.source_system = 'engager_v1'
left join stg_engager.companies stg
  on stg.id::text = er.external_id;

comment on view public.companies is
  'Compat view over canonical company + external_ref → stg_engager join. '
  'Surfaces legacy engager columns: sponsor_tier, sponsor_tier_rank, '
  'summit_interest (parsed text[]), "group", subcategory, rank_history (text), '
  'rank_last_year, rank_frequency, number_of_employees. Read-only for added '
  'columns. Drop after Phase 2 app refactor.';
