-- Phase 8 · Step 1 — Extend canonical company/contact/task with the columns the
-- Engager app needs, then backfill from stg_engager so the staging schema can
-- be dropped in a later step. Every column is nullable and additive: existing
-- writers keep working.

-- ---------------- company ---------------------------------------------------

alter table public.company
  add column if not exists sponsor_tier         text,
  add column if not exists sponsor_tier_rank    integer,
  add column if not exists summit_interest      text[],
  add column if not exists "group"              text,        -- taxonomy: macro > group > subcategory
  add column if not exists subcategory          text,
  add column if not exists rank_history         jsonb,
  add column if not exists rank_last_year       integer,
  add column if not exists rank_frequency       text,        -- categorical: '1', '4+', '2to4', 'Free', 'Problem'
  add column if not exists number_of_employees  integer,     -- raw count; complements employee_count_band
  add column if not exists keep                 boolean not null default true;

-- Backfill from stg_engager.companies via the same external_ref path the
-- compat view uses today. Overwrite target columns unconditionally: the
-- staging row is the source of truth for these fields.
update public.company c
set
  sponsor_tier        = stg.sponsor_tier,
  sponsor_tier_rank   = stg.sponsor_tier_rank,
  summit_interest     = case
                          when stg.summit_interest is null or stg.summit_interest = ''
                            then null
                          else (
                            select array_agg(elem.value)
                            from jsonb_array_elements_text(
                              case
                                when stg.summit_interest ~ '^\s*\[' then stg.summit_interest::jsonb
                                else jsonb_build_array(stg.summit_interest)
                              end
                            ) elem
                          )
                        end,
  "group"             = stg."group",
  subcategory         = stg.subcategory,
  rank_history        = case
                          when stg.rank_history is null then null
                          else stg.rank_history
                        end,
  rank_last_year      = stg.rank_last_year,
  rank_frequency      = nullif(stg.rank_frequency, ''),
  number_of_employees = case
                          when stg.number_of_employees is null or stg.number_of_employees = '' then null
                          when stg.number_of_employees ~ '^-?[0-9]+(\.[0-9]+)?$' then stg.number_of_employees::numeric::integer
                          else null
                        end
from public.external_ref er
join stg_engager.companies stg on stg.id = er.external_id
where er.entity_table = 'company'
  and er.entity_id    = c.id
  and er.source_system = 'engager_v1';

-- Indexes on the columns that will be filtered/sorted often.
create index if not exists company_sponsor_tier_rank_idx
  on public.company (sponsor_tier_rank) where sponsor_tier_rank is not null;
create index if not exists company_group_idx        on public.company ("group");
create index if not exists company_subcategory_idx  on public.company (subcategory);


-- ---------------- contact ---------------------------------------------------

alter table public.contact
  add column if not exists key_contact              text[],
  add column if not exists unsubscribed_all_email   boolean not null default false,
  add column if not exists last_email_open_date     timestamptz,
  add column if not exists last_email_click_date    timestamptz,
  add column if not exists last_activity_date       timestamptz,
  add column if not exists emails_replied           integer not null default 0;

-- Backfill key_contact / unsubscribe / last-activity dates from stg_engager
update public.contact c
set
  key_contact = coalesce(
    case
      when stg.key_contact is null or stg.key_contact = '' then null
      else (
        select array_agg(elem.value)
        from jsonb_array_elements_text(
          case
            when stg.key_contact ~ '^\s*\[' then stg.key_contact::jsonb
            else jsonb_build_array(stg.key_contact)
          end
        ) elem
      )
    end,
    -- fallback: keep any tag-derived key_contact the compat view synthesized
    (select array_agg(distinct upper(t.slug))
       from public.entity_tag et
       join public.tag t on t.id = et.tag_id
      where et.entity_table = 'contact' and et.entity_id = c.id),
    '{}'::text[]
  ),
  unsubscribed_all_email = coalesce(stg.unsubscribed_all_email, false),
  last_email_open_date   = stg.last_email_open_date,
  last_email_click_date  = stg.last_email_click_date
from public.external_ref er
join stg_engager.contacts stg on stg.id = er.external_id
where er.entity_table = 'contact'
  and er.entity_id    = c.id
  and er.source_system = 'engager_v1';

-- Ensure unsubscribed_all and unsubscribed_all_email agree
update public.contact
set unsubscribed_all_email = true
where unsubscribed_all = true
  and unsubscribed_all_email = false;

create index if not exists contact_key_contact_idx
  on public.contact using gin (key_contact);
create index if not exists contact_last_email_open_date_idx
  on public.contact (last_email_open_date desc nulls last);


-- ---------------- task ------------------------------------------------------

alter table public.task
  add column if not exists assigned_to text,
  add column if not exists meta        jsonb not null default '{}'::jsonb,
  add column if not exists origin      text;

-- No staging backfill required — task is a fresh domain, columns default cleanly.

create index if not exists task_assigned_to_idx on public.task (assigned_to);
create index if not exists task_origin_idx      on public.task (origin);
