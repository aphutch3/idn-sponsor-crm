-- 009_crm_monitoring.sql
-- Phase 1 · Step 1.2 · Migration 9 of 9 (DDL)
-- CRM state (crm_status, crm_note, tag, entity_tag), enrichment,
-- monitoring (agent_run, ingestion_job) — Q4 kept separate, unified via all_jobs view.
-- Plus app_health_ping heartbeat table for portfolio observability.

-- ---------- CRM state layer ----------
create table crm_status (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,   -- contact / company
  entity_id uuid not null,
  stage text not null,           -- Q5: "lead" is a stage value here, not a table
  reason text,
  owner text,
  next_step text,
  next_step_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index crm_status_entity_uidx on crm_status (entity_table, entity_id);
create index crm_status_stage_owner_idx on crm_status (stage, owner);

create table crm_note (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id uuid not null,
  author text,
  body text not null,
  pinned bool not null default false,
  created_at timestamptz not null default now()
);
create index crm_note_entity_time_idx on crm_note (entity_table, entity_id, created_at desc);

-- ---------- Tag catalog + polymorphic application (Q5: roles like "sponsor prospect", "influencer") ----------
create table tag (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  color text,
  description text,
  created_at timestamptz not null default now()
);

create table entity_tag (
  tag_id uuid not null references tag(id) on delete cascade,
  entity_table text not null,
  entity_id uuid not null,
  applied_at timestamptz not null default now(),
  applied_by text,
  primary key (tag_id, entity_table, entity_id)
);
create index entity_tag_entity_idx on entity_tag (entity_table, entity_id);

-- ---------- Enrichment audit ----------
create table enrichment (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id uuid not null,
  source text not null,   -- apollo / linkedin / web / agent / firecrawl
  fields_updated text[],
  payload jsonb not null default '{}'::jsonb,
  cost_usd numeric(8,4),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index enrichment_entity_time_idx on enrichment (entity_table, entity_id, occurred_at desc);
create index enrichment_source_time_idx on enrichment (source, occurred_at desc);

-- ---------- Monitoring layer (Q4: separate but joined via all_jobs view) ----------
create table agent_run (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  model text,
  status text not null default 'queued',
  input jsonb,
  output jsonb,
  error text,
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10,4),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int generated always as (
    case when started_at is null or completed_at is null then null
         else (extract(epoch from (completed_at - started_at)) * 1000)::int
    end
  ) stored,
  entity_table text,
  entity_id uuid,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index agent_run_name_status_idx on agent_run (agent_name, status, started_at desc);
create index agent_run_entity_idx on agent_run (entity_table, entity_id, started_at desc) where entity_id is not null;

create table ingestion_job (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  source_system text references source_system(code),
  status text not null default 'queued',
  rows_read int,
  rows_upserted int,
  rows_failed int,
  errors jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int generated always as (
    case when started_at is null or completed_at is null then null
         else (extract(epoch from (completed_at - started_at)) * 1000)::int
    end
  ) stored,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ingestion_job_name_status_idx on ingestion_job (job_name, status, started_at desc);
create index ingestion_job_source_time_idx on ingestion_job (source_system, started_at desc) where source_system is not null;

-- ---------- Portfolio health telemetry ----------
create table app_health_ping (
  id uuid primary key default gen_random_uuid(),
  app_slug text not null,
  ok bool not null,
  latency_ms int,
  note text,
  checked_at timestamptz not null default now()
);
create index app_health_ping_app_time_idx on app_health_ping (app_slug, checked_at desc);

-- ---------- Unified jobs view (Q4) ----------
create view all_jobs as
  select 'agent'::text as kind, id, agent_name as name, status, started_at, completed_at,
         duration_ms, cost_usd, null::int as rows_touched
    from agent_run
  union all
  select 'ingest'::text as kind, id, job_name as name, status, started_at, completed_at,
         duration_ms, null::numeric as cost_usd,
         coalesce(rows_upserted, 0) + coalesce(rows_failed, 0) as rows_touched
    from ingestion_job;

-- Trigger applied separately:
-- create trigger tg_crm_status_updated before update on crm_status for each row execute function tg_touch_updated_at();
