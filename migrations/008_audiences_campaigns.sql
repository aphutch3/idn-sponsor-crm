-- 008_audiences_campaigns.sql
-- Phase 1 · Step 1.2 · Migration 8 of 9 (DDL)
-- Audiences & campaigns: list, list_member (polymorphic), campaign, campaign_send, outreach_event

create table list (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  kind text not null default 'static',   -- static / dynamic
  owner text,
  filter jsonb,                           -- for dynamic lists
  member_count int not null default 0,    -- cached
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table list_member (
  list_id uuid not null references list(id) on delete cascade,
  entity_table text not null,   -- contact / person / company
  entity_id uuid not null,
  added_at timestamptz not null default now(),
  added_by text,
  source text,   -- manual / agent / import / dynamic
  meta jsonb not null default '{}'::jsonb,
  primary key (list_id, entity_table, entity_id)
);
create index list_member_entity_idx on list_member (entity_table, entity_id);

create table campaign (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'email',   -- email / linkedin / x / ads / other
  status text not null default 'draft', -- draft / scheduled / sending / sent / archived
  from_name text,
  from_email citext,
  subject text,
  preview_text text,
  body_html text,
  body_text text,
  list_id uuid references list(id) on delete set null,
  owner text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_status_idx on campaign (status, scheduled_at);
create index campaign_list_idx on campaign (list_id) where list_id is not null;

create table campaign_send (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaign(id) on delete cascade,
  contact_id uuid references contact(id) on delete set null,
  person_id  uuid references person(id)  on delete set null,
  recipient_email citext,
  provider text,                -- resend / mailgun / sendgrid / linkedin / etc.
  provider_message_id text,
  status text not null default 'queued',
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  last_event_at timestamptz,
  error text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index campaign_send_campaign_status_idx on campaign_send (campaign_id, status);
create index campaign_send_contact_time_idx on campaign_send (contact_id, sent_at desc) where contact_id is not null;
create index campaign_send_person_time_idx  on campaign_send (person_id,  sent_at desc) where person_id  is not null;
create unique index campaign_send_provider_msgid_uidx on campaign_send (provider, provider_message_id) where provider_message_id is not null;

create table outreach_event (
  id uuid primary key default gen_random_uuid(),
  campaign_send_id uuid not null references campaign_send(id) on delete cascade,
  kind text not null,  -- open / click / bounce / complaint / unsubscribe
  url text,
  user_agent text,
  ip inet,
  occurred_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);
create index outreach_event_send_time_idx on outreach_event (campaign_send_id, occurred_at desc);
create index outreach_event_kind_time_idx on outreach_event (kind, occurred_at desc);

-- Triggers applied separately:
-- create trigger tg_list_updated     before update on list     for each row execute function tg_touch_updated_at();
-- create trigger tg_campaign_updated before update on campaign for each row execute function tg_touch_updated_at();
