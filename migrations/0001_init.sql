-- IDN Sponsor CRM — initial schema
-- Companies + contacts imported from HubSpot; agent-driven operational tables layered on top.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- =========================================================
-- COMPANIES
-- =========================================================
create table if not exists companies (
  id              uuid primary key default gen_random_uuid(),
  hubspot_record_id text unique,
  name            text not null,
  domain          text,
  website_url     text,
  linkedin_url    text,
  twitter_handle  text,

  -- Sponsor / summit fields (typed first-class)
  summit_interest      text[],      -- parsed from "AI Deployment; Cloud Architecture"
  sponsor_tier         text,        -- e.g. 5_Resurrection, 1_Top Tier
  sponsor_tier_rank    int,         -- numeric prefix for sorting/filtering
  rank_history         text,
  activity             text[],
  conferences          text[],
  conference_speaking  text,
  company_type         text,        -- Prospect / Customer / Agency ...
  keep                 text,        -- 'Keep' flag

  -- Classification
  macro_category  text,
  "group"         text,
  subcategory     text,
  industry        text,
  technology      text,
  startup         boolean,
  marketing_budget numeric,
  total_revenue   numeric,
  number_of_employees text,
  country_region  text,

  -- Marketing engagement (company-level)
  pageviews_count int,
  blockers_count  int,

  -- Owner + timestamps from HubSpot
  company_owner   text,
  last_activity_date timestamptz,
  hs_create_date  timestamptz,

  -- Full raw payload preserved
  raw             jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_companies_name_trgm on companies using gin (name gin_trgm_ops);
create index if not exists idx_companies_domain on companies (domain);
create index if not exists idx_companies_tier on companies (sponsor_tier_rank);
create index if not exists idx_companies_summit_interest on companies using gin (summit_interest);
create index if not exists idx_companies_macro on companies (macro_category);
create index if not exists idx_companies_country on companies (country_region);

-- =========================================================
-- CONTACTS
-- =========================================================
create table if not exists contacts (
  id              uuid primary key default gen_random_uuid(),
  hubspot_record_id text unique,
  company_id      uuid references companies(id) on delete set null,
  hubspot_company_id text,           -- fallback join key when company_id null
  associated_company_ids text[],     -- HubSpot may associate a contact with multiple

  first_name      text,
  last_name       text,
  full_name       text generated always as (
    trim(both ' ' from coalesce(first_name,'') || ' ' || coalesce(last_name,''))
  ) stored,
  email           text,
  email_domain    text,
  job_title       text,
  linkedin_url    text,
  twitter_username text,
  country_region  text,
  phone           text,

  -- Sponsor / pipeline
  key_contact     text[],            -- FRIEND, SPEAKER, TARGET, MOVED (multi)
  focus           text,
  deal_type       text,              -- 2_DealMaker etc
  list_type       text[],            -- Speaker_EvangConf etc
  lead_status     text,              -- Open / New / ...
  contact_owner   text,

  -- Marketing engagement
  marketing_contact_status text,
  unsubscribed_all_email   boolean default false,
  opted_out_marketing_info boolean default false,
  emails_delivered int default 0,
  emails_opened    int default 0,
  emails_clicked   int default 0,
  emails_replied   int default 0,
  emails_bounced   int default 0,
  hard_bounce_reason text,
  last_email_send_date  timestamptz,
  last_email_open_date  timestamptz,
  last_email_click_date timestamptz,
  last_email_reply_date timestamptz,
  recent_sales_email_open_date timestamptz,
  recent_sales_email_click_date timestamptz,
  times_contacted  int default 0,

  hs_create_date        timestamptz,
  last_activity_date    timestamptz,

  raw             jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_contacts_company on contacts (company_id);
create index if not exists idx_contacts_email on contacts (lower(email));
create index if not exists idx_contacts_name_trgm on contacts using gin (full_name gin_trgm_ops);
create index if not exists idx_contacts_title_trgm on contacts using gin (job_title gin_trgm_ops);
create index if not exists idx_contacts_key on contacts using gin (key_contact);
create index if not exists idx_contacts_lead_status on contacts (lead_status);

-- =========================================================
-- OPERATIONAL LAYER (agent-driven OS)
-- =========================================================
create type activity_kind as enum (
  'note','call','email_sent','email_received','meeting',
  'linkedin_touch','summit_invite','contract_sent','contract_signed','other'
);

create table if not exists activities (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  contact_id    uuid references contacts(id) on delete cascade,
  kind          activity_kind not null,
  subject       text,
  body          text,
  occurred_at   timestamptz not null default now(),
  actor         text,                       -- who / what created it
  source        text default 'manual',      -- manual / agent / import / resend / hubspot
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_activities_company on activities (company_id, occurred_at desc);
create index if not exists idx_activities_contact on activities (contact_id, occurred_at desc);

create type task_status as enum ('open','in_progress','waiting','done','cancelled');

create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete set null,
  contact_id    uuid references contacts(id) on delete set null,
  title         text not null,
  detail        text,
  status        task_status not null default 'open',
  due_at        timestamptz,
  assigned_to   text,
  origin        text default 'manual',      -- manual / agent
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_tasks_status_due on tasks (status, due_at);

-- Saved segments — SQL-backed filters
create table if not exists segments (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  description   text,
  entity        text not null check (entity in ('company','contact')),
  filter        jsonb not null default '{}'::jsonb,   -- structured filter spec
  sql_where     text,                                  -- optional escape hatch
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Campaigns (Resend hooks) — stubbed for now
create table if not exists campaigns (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  status        text not null default 'draft',        -- draft / scheduled / sending / done
  segment_id    uuid references segments(id) on delete set null,
  subject       text,
  from_addr     text,
  reply_to      text,
  body_html     text,
  body_text     text,
  scheduled_for timestamptz,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists campaign_sends (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  resend_id     text,
  status        text default 'queued',    -- queued / sent / delivered / bounced / complained / opened / clicked
  sent_at       timestamptz,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_campaign_sends_campaign on campaign_sends (campaign_id);
create index if not exists idx_campaign_sends_contact on campaign_sends (contact_id);

-- Agent runs — audit trail for autonomous work
create table if not exists agent_runs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,             -- enrich / research / segment / draft_email / next_actions
  target_type   text,                      -- company / contact / segment
  target_id     uuid,
  model         text,
  status        text not null default 'running',
  input         jsonb not null default '{}'::jsonb,
  output        jsonb,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists idx_agent_runs_target on agent_runs (target_type, target_id, started_at desc);

-- Enrichment cache — reuse research across contacts at a company
create table if not exists enrichments (
  id            uuid primary key default gen_random_uuid(),
  target_type   text not null,             -- company / contact
  target_id     uuid not null,
  provider      text not null,             -- perplexity / apollo / zoominfo / manual
  payload       jsonb not null,
  fetched_at    timestamptz not null default now()
);
create index if not exists idx_enrichments_target on enrichments (target_type, target_id, fetched_at desc);

-- =========================================================
-- Views for the app
-- =========================================================
create or replace view v_company_stats as
select
  c.id,
  c.name,
  c.sponsor_tier,
  c.sponsor_tier_rank,
  c.macro_category,
  c."group",
  c.subcategory,
  c.summit_interest,
  c.company_type,
  c.country_region,
  (select count(*) from contacts x where x.company_id = c.id) as contact_count,
  (select max(x.last_email_send_date) from contacts x where x.company_id = c.id) as last_email_send,
  (select sum(x.emails_opened)::int from contacts x where x.company_id = c.id) as opens_total,
  (select sum(x.emails_clicked)::int from contacts x where x.company_id = c.id) as clicks_total,
  (select sum(x.emails_replied)::int from contacts x where x.company_id = c.id) as replies_total
from companies c;

-- =========================================================
-- RLS — permissive for MVP (agent-driven internal app, no external users yet)
-- =========================================================
alter table companies       enable row level security;
alter table contacts        enable row level security;
alter table activities      enable row level security;
alter table tasks           enable row level security;
alter table segments        enable row level security;
alter table campaigns       enable row level security;
alter table campaign_sends  enable row level security;
alter table agent_runs      enable row level security;
alter table enrichments     enable row level security;

-- Service-role bypasses RLS automatically. For anon/public reads we lock down; app uses service role via API routes.
-- (No public policies added — reads/writes go through server routes with the service key.)
