-- 003_lineage.sql
-- Phase 1 · Step 1.2 · Migration 3 of 9 (DDL)
-- Lineage domain: source catalog + polymorphic external-id map + editorial citations.
-- Q6: no permanent remap tables; legacy IDs live in external_ref.external_id and
-- staging schemas are dropped after verification.

-- Catalog of import origins
create table if not exists source_system (
  code            text primary key,
  name            text not null,
  description     text,
  is_active       bool not null default true,
  created_at      timestamptz not null default now()
);

-- Seed the known sources for this session's scope
insert into source_system (code, name, description) values
  ('engager_v1',      'The Engager v1',            'Legacy Engager Supabase (wpgfanjopuupjcgrdbmb) as of 2026-09'),
  ('idn_events',      'IDN Events Platform',       'Supabase project vqyfoufbelngmgowgkmt'),
  ('aie',             'AIE Sponsor Intel',         'Supabase project oxltohcbdzgpjidqfolh, aie schema'),
  ('hubspot',         'HubSpot',                   'Original HubSpot export lineage carried through Engager v1'),
  ('canonical',       'Canonical (native)',        'Rows created natively in canonical, no external source')
on conflict (code) do nothing;

-- Polymorphic lineage: every imported row keeps its foreign IDs here for audit and rollback.
create table if not exists external_ref (
  entity_table    text not null,
  entity_id       uuid not null,
  source_system   text not null references source_system(code),
  external_id     text not null,
  external_url    text,
  imported_at     timestamptz not null default now(),
  meta            jsonb not null default '{}'::jsonb,
  primary key (entity_table, entity_id, source_system, external_id)
);

-- Reverse-lookup index: given a legacy ID, find the canonical entity
create index if not exists external_ref_source_ext_idx
  on external_ref (source_system, entity_table, external_id);

-- Editorial citations (URLs backing a fact). Distinct from external_ref.
create table if not exists source_reference (
  id              uuid primary key default gen_random_uuid(),
  entity_table    text not null,
  entity_id       uuid not null,
  url             text not null,
  title           text,
  quote           text,
  cited_at        timestamptz not null default now(),
  meta            jsonb not null default '{}'::jsonb
);

create index if not exists source_reference_entity_idx
  on source_reference (entity_table, entity_id);
