-- Phase 8 · Step 2 — Create the new canonical tables Engager needs.
-- Everything additive; every table gets updated_at trigger + owner text (matches
-- the rest of canonical).

-- ============================================================================
-- LinkedIn monitoring domain
-- ============================================================================

-- Monitor configuration: a scheduled crawler bound to a list of entities.
create table if not exists public.linkedin_monitor_config (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  list_binding_id     uuid,             -- FK added after list_binding is created
  fetch_types         text[] not null default '{}',
  cadence_seconds     integer not null default 21600,
  jitter_seconds      integer not null default 1800,
  batch_size          integer not null default 15,
  per_fetch_delay_ms  integer not null default 60000,
  active              boolean not null default true,
  last_run_at         timestamptz,
  next_run_at         timestamptz,
  run_cursor          jsonb,
  relevance_min_score numeric,
  topic_filter        jsonb,
  score_posts         boolean not null default false,
  meta                jsonb not null default '{}'::jsonb,
  raw                 jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists linkedin_monitor_config_next_run_at_idx
  on public.linkedin_monitor_config (next_run_at) where active = true;
create index if not exists linkedin_monitor_config_list_binding_id_idx
  on public.linkedin_monitor_config (list_binding_id);


-- Immutable snapshot of a LinkedIn page fetch.
create table if not exists public.linkedin_snapshot (
  id                uuid primary key default gen_random_uuid(),
  entity_type       text not null,   -- 'company' | 'contact' | 'person'
  entity_id         uuid not null,
  fetch_type        text not null,
  source_url        text not null,
  http_status       integer,
  content_hash      text not null,
  parsed            jsonb not null default '{}'::jsonb,
  monitor_config_id uuid references public.linkedin_monitor_config(id) on delete set null,
  error             text,
  fetched_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists linkedin_snapshot_entity_idx
  on public.linkedin_snapshot (entity_type, entity_id, fetched_at desc);
create index if not exists linkedin_snapshot_config_idx
  on public.linkedin_snapshot (monitor_config_id, fetched_at desc);
create index if not exists linkedin_snapshot_hash_idx
  on public.linkedin_snapshot (content_hash);


-- Detected change between snapshots (new post, hire, role change, follower delta, etc.)
create table if not exists public.linkedin_signal (
  id                uuid primary key default gen_random_uuid(),
  entity_type       text not null,
  entity_id         uuid not null,
  snapshot_id       uuid not null references public.linkedin_snapshot(id) on delete cascade,
  prior_snapshot_id uuid references public.linkedin_snapshot(id) on delete set null,
  signal_kind       text not null,     -- 'new_post' | 'role_change' | 'follower_change' | 'employee_change' | ...
  before_value      jsonb,
  after_value       jsonb,
  meta              jsonb not null default '{}'::jsonb,
  raw               jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists linkedin_signal_entity_idx
  on public.linkedin_signal (entity_type, entity_id, created_at desc);
create index if not exists linkedin_signal_kind_idx
  on public.linkedin_signal (signal_kind, created_at desc);
create index if not exists linkedin_signal_snapshot_idx
  on public.linkedin_signal (snapshot_id);


-- ============================================================================
-- List filtering + versioning + bindings
-- ============================================================================

-- Dynamic-list filter definition. One row per list_id.
create table if not exists public.list_filter (
  list_id            uuid primary key references public.list(id) on delete cascade,
  filter_json        jsonb not null,
  refresh_cadence    text,                          -- 'hourly' | 'daily' | 'weekly' | 'manual'
  last_refreshed_at  timestamptz,
  last_member_count  integer,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Immutable snapshot of list membership at a point in time.
create table if not exists public.list_version (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references public.list(id) on delete cascade,
  version_num  integer not null,
  member_ids   uuid[] not null default '{}',
  member_count integer not null default 0,
  reason       text,
  created_at   timestamptz not null default now(),
  unique (list_id, version_num)
);
create index if not exists list_version_list_id_idx
  on public.list_version (list_id, version_num desc);

-- Binding: how another system consumes a list (linkedin_monitor, email_campaign, etc.)
create table if not exists public.list_binding (
  id                 uuid primary key default gen_random_uuid(),
  list_id            uuid not null references public.list(id) on delete cascade,
  binding_type       text not null,
  active             boolean not null default true,
  honor_suppressions boolean not null default true,
  config             jsonb not null default '{}'::jsonb,
  raw                jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists list_binding_list_id_idx
  on public.list_binding (list_id) where active = true;
create index if not exists list_binding_type_idx
  on public.list_binding (binding_type) where active = true;

-- Now that list_binding exists, add the FK from linkedin_monitor_config.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema='public' and table_name='linkedin_monitor_config'
      and constraint_name='linkedin_monitor_config_list_binding_id_fkey'
  ) then
    alter table public.linkedin_monitor_config
      add constraint linkedin_monitor_config_list_binding_id_fkey
      foreign key (list_binding_id) references public.list_binding(id) on delete set null;
  end if;
end$$;

-- Also make sure list.entity_types exists (older canonical uses list.kind='static' with no entity_types)
alter table public.list
  add column if not exists entity_types text[] not null default '{}'::text[],
  add column if not exists last_refreshed_at timestamptz;


-- ============================================================================
-- updated_at triggers on the new tables (shared trigger function already exists as
-- public.set_updated_at from earlier canonical migrations; if not, create it).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace) then
    execute $fn$
      create function public.set_updated_at() returns trigger language plpgsql as $body$
      begin new.updated_at = now(); return new; end;
      $body$;
    $fn$;
  end if;
end$$;

do $$
declare t text;
begin
  for t in select unnest(array['linkedin_monitor_config','list_filter','list_binding'])
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = format('%s_updated_at', t)
        and tgrelid = format('public.%I', t)::regclass
    ) then
      execute format(
        'create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
        t, t
      );
    end if;
  end loop;
end$$;
