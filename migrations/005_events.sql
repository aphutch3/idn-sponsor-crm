-- 005_events.sql
-- Phase 1 · Step 1.2 · Migration 5 of 9 (DDL)
-- Events domain: event_series, event, event_track, session, session_speaker, sponsorship, event_attendance
-- Q1 lock: session_speaker independent of sponsorship; sponsorship carries presence_kind + includes_speaking_slot
-- Q7 lock: event.kind = event_kind enum ('idn_summit', 'external_conference') only

create table event_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind event_kind not null,
  description text,
  owner_org_id uuid references company(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table event (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references event_series(id) on delete set null,
  kind event_kind not null,
  name text not null,
  slug text not null,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  venue_name text,
  venue_city text,
  venue_country text,
  host_company_id uuid references company(id) on delete set null,
  is_published bool not null default false,
  published_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index event_slug_uidx on event (slug);
create index event_start_at_idx on event (start_at) where start_at is not null;
create index event_series_idx on event (series_id) where series_id is not null;

create table event_track (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references event(id) on delete cascade,
  name text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index event_track_event_idx on event_track (event_id);

create table session (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references event(id) on delete cascade,
  track_id uuid references event_track(id) on delete set null,
  title text not null,
  description text,
  abstract text,
  start_at timestamptz,
  end_at timestamptz,
  duration_min int generated always as (
    case when start_at is null or end_at is null then null
         else extract(epoch from (end_at - start_at))::int / 60
    end
  ) stored,
  status text,
  sort_order int not null default 0,
  external_url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index session_event_idx on session (event_id);
create index session_track_idx on session (track_id) where track_id is not null;
create index session_start_at_idx on session (start_at) where start_at is not null;

create table session_speaker (
  session_id uuid not null references session(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  role text not null default 'speaker',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  primary key (session_id, person_id)
);
create index session_speaker_person_idx on session_speaker (person_id);

create table sponsorship (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references event(id) on delete cascade,
  company_id uuid not null references company(id) on delete cascade,
  tier text,
  presence_kind text,             -- Q1: physical / virtual / hybrid / logo_only
  includes_speaking_slot bool not null default false,  -- Q1
  amount_usd numeric(12,2),
  contract_signed_at timestamptz,
  notes text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sponsorship_event_company_uidx on sponsorship (event_id, company_id);
create index sponsorship_company_idx on sponsorship (company_id);

create table event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references event(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  role event_role not null default 'attendee',
  registered_at timestamptz,
  attended_at timestamptz,
  source_system text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index event_attendance_uidx on event_attendance (event_id, person_id, role);
create index event_attendance_person_idx on event_attendance (person_id);

-- Triggers (applied separately via run_sql to avoid connector parser splitting $$ blocks)
-- create trigger tg_event_series_updated  before update on event_series  for each row execute function tg_touch_updated_at();
-- create trigger tg_event_updated         before update on event         for each row execute function tg_touch_updated_at();
-- create trigger tg_session_updated       before update on session       for each row execute function tg_touch_updated_at();
-- create trigger tg_sponsorship_updated   before update on sponsorship   for each row execute function tg_touch_updated_at();
