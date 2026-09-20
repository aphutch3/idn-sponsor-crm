-- Phase 8 · Step 1b — More business columns found during app audit.
-- All additive, nullable, backfilled from stg_engager where the data exists there.

alter table public.company
  add column if not exists rank_stage           text,           -- pipeline stage: '1'..'5'
  add column if not exists startup              boolean,         -- explicit boolean; company.is_startup already exists
  add column if not exists marketing_budget     numeric,         -- annual marketing spend
  add column if not exists total_revenue        numeric,         -- annual revenue
  add column if not exists conferences          text[],          -- prior conferences attended
  add column if not exists conference_speaking  text[],          -- speaking engagements
  add column if not exists blockers_count       integer not null default 0,
  add column if not exists activity             text[],          -- freeform activity/interest tags
  add column if not exists company_owner        text;            -- assigned sales owner (distinct from generic 'owner')

-- Backfill startup from is_startup if present
update public.company
set startup = is_startup
where startup is null and is_startup is not null;

-- Backfill from stg_engager.companies where those columns exist
do $$
declare
  has_rank_stage        boolean;
  has_marketing_budget  boolean;
  has_total_revenue     boolean;
  has_conferences       boolean;
  has_conference_speaking boolean;
  has_blockers_count    boolean;
  has_activity          boolean;
  has_company_owner     boolean;
begin
  select exists(select 1 from information_schema.columns
                where table_schema='stg_engager' and table_name='companies' and column_name='rank_stage') into has_rank_stage;
  select exists(select 1 from information_schema.columns
                where table_schema='stg_engager' and table_name='companies' and column_name='marketing_budget') into has_marketing_budget;
  select exists(select 1 from information_schema.columns
                where table_schema='stg_engager' and table_name='companies' and column_name='total_revenue') into has_total_revenue;
  select exists(select 1 from information_schema.columns
                where table_schema='stg_engager' and table_name='companies' and column_name='conferences') into has_conferences;
  select exists(select 1 from information_schema.columns
                where table_schema='stg_engager' and table_name='companies' and column_name='conference_speaking') into has_conference_speaking;
  select exists(select 1 from information_schema.columns
                where table_schema='stg_engager' and table_name='companies' and column_name='blockers_count') into has_blockers_count;
  select exists(select 1 from information_schema.columns
                where table_schema='stg_engager' and table_name='companies' and column_name='activity') into has_activity;
  select exists(select 1 from information_schema.columns
                where table_schema='stg_engager' and table_name='companies' and column_name='company_owner') into has_company_owner;

  if has_rank_stage then
    execute $u$
      update public.company c
      set rank_stage = nullif(stg.rank_stage::text, '')
      from public.external_ref er
      join stg_engager.companies stg on stg.id = er.external_id
      where er.entity_table='company' and er.entity_id=c.id and er.source_system='engager_v1'
        and stg.rank_stage is not null
    $u$;
  end if;

  if has_marketing_budget then
    execute $u$
      update public.company c
      set marketing_budget = case
        when stg.marketing_budget is null then null
        when stg.marketing_budget::text = '' then null
        when stg.marketing_budget::text ~ '^-?[0-9]+(\.[0-9]+)?$' then stg.marketing_budget::text::numeric
        else null
      end
      from public.external_ref er
      join stg_engager.companies stg on stg.id = er.external_id
      where er.entity_table='company' and er.entity_id=c.id and er.source_system='engager_v1'
    $u$;
  end if;

  if has_total_revenue then
    execute $u$
      update public.company c
      set total_revenue = case
        when stg.total_revenue is null then null
        when stg.total_revenue::text = '' then null
        when stg.total_revenue::text ~ '^-?[0-9]+(\.[0-9]+)?$' then stg.total_revenue::text::numeric
        else null
      end
      from public.external_ref er
      join stg_engager.companies stg on stg.id = er.external_id
      where er.entity_table='company' and er.entity_id=c.id and er.source_system='engager_v1'
    $u$;
  end if;

  if has_company_owner then
    execute $u$
      update public.company c
      set company_owner = nullif(stg.company_owner::text, '')
      from public.external_ref er
      join stg_engager.companies stg on stg.id = er.external_id
      where er.entity_table='company' and er.entity_id=c.id and er.source_system='engager_v1'
    $u$;
  end if;

  if has_blockers_count then
    execute $u$
      update public.company c
      set blockers_count = coalesce(case
        when stg.blockers_count::text ~ '^-?[0-9]+$' then stg.blockers_count::text::integer
        else 0
      end, 0)
      from public.external_ref er
      join stg_engager.companies stg on stg.id = er.external_id
      where er.entity_table='company' and er.entity_id=c.id and er.source_system='engager_v1'
    $u$;
  end if;

  -- text[] columns: try to parse each. If the stg value is a JSON array string, unwrap it.
  if has_conferences then
    execute $u$
      update public.company c
      set conferences = case
        when stg.conferences is null then null
        when stg.conferences::text = '' then null
        when stg.conferences::text ~ '^\s*\[' then (
          select array_agg(elem.value)
          from jsonb_array_elements_text(stg.conferences::text::jsonb) elem
        )
        else array[stg.conferences::text]
      end
      from public.external_ref er
      join stg_engager.companies stg on stg.id = er.external_id
      where er.entity_table='company' and er.entity_id=c.id and er.source_system='engager_v1'
    $u$;
  end if;

  if has_conference_speaking then
    execute $u$
      update public.company c
      set conference_speaking = case
        when stg.conference_speaking is null then null
        when stg.conference_speaking::text = '' then null
        when stg.conference_speaking::text ~ '^\s*\[' then (
          select array_agg(elem.value)
          from jsonb_array_elements_text(stg.conference_speaking::text::jsonb) elem
        )
        else array[stg.conference_speaking::text]
      end
      from public.external_ref er
      join stg_engager.companies stg on stg.id = er.external_id
      where er.entity_table='company' and er.entity_id=c.id and er.source_system='engager_v1'
    $u$;
  end if;

  if has_activity then
    execute $u$
      update public.company c
      set activity = case
        when stg.activity is null then null
        when stg.activity::text = '' then null
        when stg.activity::text ~ '^\s*\[' then (
          select array_agg(elem.value)
          from jsonb_array_elements_text(stg.activity::text::jsonb) elem
        )
        else array[stg.activity::text]
      end
      from public.external_ref er
      join stg_engager.companies stg on stg.id = er.external_id
      where er.entity_table='company' and er.entity_id=c.id and er.source_system='engager_v1'
    $u$;
  end if;
end$$;

create index if not exists company_rank_stage_idx on public.company (rank_stage) where rank_stage is not null;
create index if not exists company_company_owner_idx on public.company (company_owner) where company_owner is not null;
