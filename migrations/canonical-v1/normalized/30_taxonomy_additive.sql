-- IDN Canonical Schema Contract v1
-- Release candidate canonical-v1. Execute only through the guarded release runner.
-- Adds hierarchy, aliases, redirects, and governed assignment evidence.

begin;

alter table public.tag
  add column if not exists parent_id uuid,
  add column if not exists normalized_label text,
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists is_curated boolean not null default false,
  add column if not exists source_system text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tag'::regclass
      and conname = 'tag_parent_id_fkey'
  ) then
    alter table public.tag
      add constraint tag_parent_id_fkey
      foreign key (parent_id) references public.tag(id) on delete restrict
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tag'::regclass
      and conname = 'tag_source_system_fkey'
  ) then
    alter table public.tag
      add constraint tag_source_system_fkey
      foreign key (source_system) references public.source_system(code)
      not valid;
  end if;
end $$;

alter table public.tag
  drop constraint if exists tag_lifecycle_state_check;
alter table public.tag
  add constraint tag_lifecycle_state_check
  check (lifecycle_state in ('active', 'deprecated', 'merged', 'retired'));

alter table public.tag
  drop constraint if exists tag_not_own_parent_check;
alter table public.tag
  add constraint tag_not_own_parent_check check (parent_id is distinct from id);

-- Populate normalized_label before making it mandatory.
update public.tag
set normalized_label = lower(regexp_replace(trim(label), '[^a-zA-Z0-9]+', ' ', 'g'))
where normalized_label is null;

create unique index if not exists tag_parent_normalized_label_uk
  on public.tag (
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_label
  )
  where lifecycle_state = 'active';

create table if not exists public.tag_alias (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references public.tag(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  language_code text,
  source_system text references public.source_system(code),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique nulls not distinct (normalized_alias, language_code)
);

create table if not exists public.tag_redirect (
  retired_tag_id uuid primary key,
  surviving_tag_id uuid not null references public.tag(id) on delete restrict,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  redirected_at timestamptz not null default now(),
  redirected_by text not null,
  check (retired_tag_id <> surviving_tag_id)
);

alter table public.entity_tag
  add column if not exists source_system text,
  add column if not exists confidence numeric(6,5),
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists valid_from_at timestamptz,
  add column if not exists valid_until_at timestamptz;

do $$
begin
  perform pg_advisory_xact_lock(7092026, 304);
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.entity_tag'::regclass
      and conname = 'entity_tag_source_system_fkey'
  ) then
    alter table public.entity_tag
      add constraint entity_tag_source_system_fkey
      foreign key (source_system) references public.source_system(code)
      not valid;
  end if;
end $$;

alter table public.entity_tag
  drop constraint if exists entity_tag_confidence_check;
alter table public.entity_tag
  add constraint entity_tag_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table public.entity_tag
  drop constraint if exists entity_tag_validity_check;
alter table public.entity_tag
  add constraint entity_tag_validity_check
  check (
    valid_until_at is null
    or valid_from_at is null
    or valid_until_at >= valid_from_at
  );

create or replace function public.prevent_tag_cycle()
returns trigger
language plpgsql
as $$
declare
  cycle_found boolean;
begin
  perform pg_advisory_xact_lock(7092026, 304);
  if new.parent_id is null then
    return new;
  end if;

  with recursive ancestors(id, parent_id) as (
    select t.id, t.parent_id
    from public.tag t
    where t.id = new.parent_id
    union
    select t.id, t.parent_id
    from public.tag t
    join ancestors a on t.id = a.parent_id
  )
  select exists (
    select 1 from ancestors where id = new.id
  ) into cycle_found;

  if cycle_found then
    raise exception 'tag hierarchy cycle detected';
  end if;
  return new;
end;
$$;

drop trigger if exists tag_prevent_cycle on public.tag;
create trigger tag_prevent_cycle
before insert or update of parent_id on public.tag
for each row execute function public.prevent_tag_cycle();

comment on table public.tag_alias is
  'One normalized synonym resolving to a canonical topical tag.';
comment on table public.tag_redirect is
  'Durable redirect from a retired or merged tag ID to its canonical survivor.';
comment on table public.entity_tag is
  'Governed assignment of a canonical topical tag to an approved entity target, with provenance and confidence.';

-- Before enforcement:
-- 1. Inventory all current entity_table values and approve target kinds.
-- 2. Build canonical/Signals/Engager/Voices reconciliation maps.
-- 3. Preserve current tag IDs where semantically equivalent.
-- 4. Validate hierarchy acyclicity and sibling uniqueness.
-- 5. Add target-existence enforcement for approved polymorphic entity kinds.
-- 6. Make tag.normalized_label NOT NULL only after reconciliation.

commit;
