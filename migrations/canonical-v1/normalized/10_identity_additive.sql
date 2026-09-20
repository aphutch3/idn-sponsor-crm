-- IDN Canonical Schema Contract v1
-- Release candidate canonical-v1. Execute only through the guarded release runner.
-- Additive identity foundations. Does not drop contact or duplicated person columns.

begin;

create schema if not exists engager;

create table if not exists public.person_company_role (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  relationship_kind text not null
    check (relationship_kind in (
      'employee', 'founder', 'owner', 'advisor', 'board_member',
      'contractor', 'member', 'other'
    )),
  title text,
  started_on date,
  ended_on date,
  source_system text references public.source_system(code),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create unique index if not exists person_company_role_identity_uk
  on public.person_company_role (
    person_id,
    company_id,
    relationship_kind,
    coalesce(started_on, '-infinity'::date)
  );

create index if not exists person_company_role_person_time_idx
  on public.person_company_role (person_id, ended_on, started_on desc);

create index if not exists person_company_role_company_time_idx
  on public.person_company_role (company_id, ended_on, started_on desc);

create table if not exists public.person_identity_merge (
  id uuid primary key default gen_random_uuid(),
  losing_person_id uuid not null,
  surviving_person_id uuid not null references public.person(id) on delete restrict,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  merged_by text not null,
  merge_run_id uuid,
  merged_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by text,
  reversal_reason text,
  check (losing_person_id <> surviving_person_id),
  check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or
    (reversed_at is not null and reversed_by is not null and reversal_reason is not null)
  )
);

create unique index if not exists person_identity_merge_active_loser_uk
  on public.person_identity_merge (losing_person_id)
  where reversed_at is null;

create table if not exists engager.person_profile (
  person_id uuid primary key references public.person(id) on delete cascade,
  outreach_state text not null default 'unknown'
    check (outreach_state in (
      'unknown', 'researched', 'contactable', 'engaged', 'suppressed'
    )),
  owner_person_id uuid references public.person(id) on delete set null,
  buying_influence text,
  lead_state text,
  priority_score numeric(6,3),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists engager.company_profile (
  company_id uuid primary key references public.company(id) on delete cascade,
  owner_person_id uuid references public.person(id) on delete set null,
  sponsor_tier text,
  sponsor_tier_rank integer,
  is_customer boolean not null default false,
  is_startup boolean not null default false,
  is_priority boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sponsor_tier_rank is null or sponsor_tier_rank > 0)
);

comment on table public.person_company_role is
  'One dated employment or affiliation relationship between a canonical person and company.';
comment on table public.person_identity_merge is
  'Audit record for replacing one canonical person identity with another. The losing ID remains as historical evidence and lineage.';
comment on table engager.person_profile is
  'Engager-only sales and outreach state for one canonical person. It is not universal person identity.';
comment on table engager.company_profile is
  'Engager-only sales and sponsor state for one canonical company.';

-- Transitional verification expectations before any destructive migration:
-- 1. Backfill person_company_role from person.current_company_id/current_title,
--    contact_company, and existing person_role company scopes.
-- 2. Backfill engager profiles from contact/staging/app-private columns.
-- 3. Preserve every contact ID in external_ref.
-- 4. Retarget dependent FKs and application queries.
-- 5. Prove dual-read equivalence.
-- 6. Only then prepare a separately approved destructive migration.

commit;
