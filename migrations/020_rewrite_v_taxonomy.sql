-- Phase 8 · Step 5 — Rewrite v_taxonomy to query canonical company directly
-- (was going through the plural compat view). Same output shape so the app
-- keeps working.

drop view if exists public.v_taxonomy;

create view public.v_taxonomy as
select
  macro_category,
  "group",
  subcategory,
  count(*)::integer as company_count
from public.company
where macro_category is not null
group by macro_category, "group", subcategory;
