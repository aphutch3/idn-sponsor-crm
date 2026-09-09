-- 004_core_domain.sql
-- Phase 1 · Step 1.2 · Migration 4 of 9 (DDL)
-- Core domain: company, contact, person, contact_company.
-- Q2: first-class embeddings on person and company + audit columns + HNSW.
-- Q5: current_company_id nullable (self-employed); roles live in entity_tag.

-- ---------- company ----------
create table if not exists company (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  normalized_name       text generated always as (lower(regexp_replace(name, '[^a-zA-Z0-9]+', ' ', 'g'))) stored,
  domain                citext,
  website_url           text,
  linkedin_url          text,
  twitter_handle        text,
  country_region        text,
  employee_count_band   text,
  macro_category        text,
  industry              text,
  company_type          text,
  is_customer           bool not null default false,
  is_startup            bool not null default false,
  stay_on_top           bool not null default false,
  owner                 text,
  -- Q2: first-class embedding + audit columns
  embedding             vector(1536),
  embedding_model       text,
  embedding_source      jsonb,
  embedding_updated_at  timestamptz,
  embedding_from_people vector(1536),  -- optional centroid of people embeddings
  raw                   jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists company_domain_uidx on company (domain) where domain is not null;
create index if not exists company_normalized_name_trgm on company using gin (normalized_name gin_trgm_ops);
create index if not exists company_embedding_hnsw on company using hnsw (embedding vector_cosine_ops);

-- ---------- contact ----------
-- Sales-qualified person with an email. Belongs to a company (or NULL for self-employed).
create table if not exists contact (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid references company(id) on delete set null,
  first_name            text,
  last_name             text,
  full_name             text generated always as (trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) stored,
  email                 citext,
  email_domain          text generated always as (
    case when email is null then null
         else lower(split_part(email::text, '@', 2)) end
  ) stored,
  job_title             text,
  linkedin_url          text,
  phone                 text,
  twitter_username      text,
  lead_status           text,
  owner                 text,
  unsubscribed_all      bool not null default false,
  opted_out_marketing   bool not null default false,
  raw                   jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists contact_email_uidx on contact (email) where email is not null;
create index if not exists contact_company_idx on contact (company_id) where company_id is not null;

-- ---------- person ----------
-- Any person we know about, even without an email. Speakers, attendees, influencers, research targets.
-- Q5: current_company_id nullable (self-employed).
-- Q2: flagship embedding — composed from bio + talk abstracts + LinkedIn posts + company context.
create table if not exists person (
  id                    uuid primary key default gen_random_uuid(),
  contact_id            uuid references contact(id) on delete set null,
  full_name             text not null,
  normalized_name       text generated always as (lower(regexp_replace(full_name, '[^a-zA-Z0-9]+', ' ', 'g'))) stored,
  email                 citext,
  linkedin_url          text,
  current_company_id    uuid references company(id) on delete set null,
  current_title         text,
  bio                   text,
  buying_influence      text,
  -- Q2: flagship embedding + audit columns
  embedding             vector(1536),
  embedding_model       text,
  embedding_source      jsonb,
  embedding_updated_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists person_email_uidx on person (email) where email is not null;
create unique index if not exists person_linkedin_uidx on person (linkedin_url) where linkedin_url is not null;
create index if not exists person_current_company_idx on person (current_company_id) where current_company_id is not null;
create index if not exists person_contact_idx on person (contact_id) where contact_id is not null;
create index if not exists person_normalized_name_trgm on person using gin (normalized_name gin_trgm_ops);
create index if not exists person_embedding_hnsw on person using hnsw (embedding vector_cosine_ops);

-- ---------- contact_company (HubSpot associated_company_ids many-to-many) ----------
create table if not exists contact_company (
  contact_id   uuid not null references contact(id) on delete cascade,
  company_id   uuid not null references company(id) on delete cascade,
  is_primary   bool not null default false,
  role         text,
  created_at   timestamptz not null default now(),
  primary key (contact_id, company_id)
);

create index if not exists contact_company_company_idx on contact_company (company_id);

-- Auto-touch updated_at on write
create or replace function tg_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$ begin
  create trigger tg_company_updated  before update on company  for each row execute function tg_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger tg_contact_updated  before update on contact  for each row execute function tg_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger tg_person_updated   before update on person   for each row execute function tg_touch_updated_at();
exception when duplicate_object then null; end $$;
