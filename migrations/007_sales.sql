-- 007_sales.sql
-- Phase 1 · Step 1.2 · Migration 7 of 9 (DDL)
-- Sales domain: activity (timeline), task (action items)

create table activity (
  id uuid primary key default gen_random_uuid(),
  kind activity_kind not null,
  contact_id uuid references contact(id) on delete set null,
  person_id uuid references person(id) on delete set null,
  company_id uuid references company(id) on delete set null,
  event_id uuid references event(id) on delete set null,
  owner text,
  subject text,
  body text,
  direction text,      -- inbound / outbound / null
  occurred_at timestamptz not null default now(),
  source_system text,
  external_id text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_contact_time_idx on activity (contact_id, occurred_at desc) where contact_id is not null;
create index activity_company_time_idx on activity (company_id, occurred_at desc) where company_id is not null;
create index activity_person_time_idx  on activity (person_id,  occurred_at desc) where person_id  is not null;
create index activity_event_time_idx   on activity (event_id,   occurred_at desc) where event_id   is not null;
create unique index activity_source_ext_uidx on activity (source_system, external_id) where external_id is not null;

create table task (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  status text not null default 'open',   -- open / done / blocked / cancelled
  priority text,                          -- low / med / high / null
  owner text,
  assigned_by text,
  contact_id uuid references contact(id) on delete set null,
  company_id uuid references company(id) on delete set null,
  person_id  uuid references person(id)  on delete set null,
  event_id   uuid references event(id)   on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index task_owner_status_due_idx  on task (owner, status, due_at);
create index task_contact_status_idx    on task (contact_id, status) where contact_id is not null;
create index task_company_status_idx    on task (company_id, status) where company_id is not null;

-- Trigger applied separately:
-- create trigger tg_task_updated before update on task for each row execute function tg_touch_updated_at();
