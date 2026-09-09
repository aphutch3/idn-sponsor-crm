-- 006_media.sql
-- Phase 1 · Step 1.2 · Migration 6 of 9 (DDL)
-- Media domain: media_asset, transcript, session_resource

create table media_asset (
  id uuid primary key default gen_random_uuid(),
  kind media_kind not null,
  status media_status not null default 'uploading',
  title text,
  description text,
  storage_url text,
  source_url text,
  mux_asset_id text,
  mux_playback_id text,
  duration_sec int,
  width int,
  height int,
  bytes bigint,
  mime_type text,
  session_id uuid references session(id) on delete set null,
  uploader_person_id uuid references person(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_asset_session_idx on media_asset (session_id) where session_id is not null;
create index media_asset_kind_status_idx on media_asset (kind, status);
create unique index media_asset_mux_uidx on media_asset (mux_asset_id) where mux_asset_id is not null;

create table transcript (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references media_asset(id) on delete cascade,
  provider text not null,
  model text not null,
  language text not null default 'en',
  text text,
  segments jsonb,
  summary text,
  word_count int generated always as (
    case when text is null then null
         else array_length(regexp_split_to_array(trim(text), '\s+'), 1)
    end
  ) stored,
  duration_sec int,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index transcript_asset_provider_uidx on transcript (media_asset_id, provider, model);

create table session_resource (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references session(id) on delete cascade,
  media_asset_id uuid references media_asset(id) on delete set null,
  kind text not null,   -- deck / doc / link / handout
  title text,
  url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index session_resource_session_idx on session_resource (session_id);
create index session_resource_media_idx on session_resource (media_asset_id) where media_asset_id is not null;

-- Triggers applied separately via run_sql:
-- create trigger tg_media_asset_updated before update on media_asset for each row execute function tg_touch_updated_at();
-- create trigger tg_transcript_updated  before update on transcript  for each row execute function tg_touch_updated_at();
