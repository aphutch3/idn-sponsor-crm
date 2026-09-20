-- Phase 8 · Step 3 — Enterprise-grade email tracking on canonical.
-- Aligns Engager (Mini) with Email Builder v2 (Enterprise), while introducing
-- the normalized event table both apps will converge on.

-- ============================================================================
-- send_status enum (matches email-builder-v2 exactly)
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'send_status') then
    create type public.send_status as enum (
      'queued','sent','delivered','bounced','complaint','failed'
    );
  end if;
end$$;


-- ============================================================================
-- campaign_send: add Enterprise-alignment columns + rollup counters
-- ============================================================================

alter table public.campaign_send
  add column if not exists subject             text,
  add column if not exists snapshot_id         uuid,               -- template snapshot for reproducibility
  add column if not exists stubbed_html        text,               -- rendered HTML with tracking pixels/links
  add column if not exists provider_events     jsonb not null default '[]'::jsonb,  -- raw webhook log (Email Builder parity)
  add column if not exists opens               integer not null default 0,
  add column if not exists clicks              integer not null default 0,
  add column if not exists first_opened_at     timestamptz,
  add column if not exists last_opened_at      timestamptz,
  add column if not exists first_clicked_at    timestamptz,
  add column if not exists last_clicked_at     timestamptz,
  add column if not exists last_clicked_url    text;

-- Migrate status column from free-form text to the enum. Any existing value
-- outside the enum is coerced to 'queued' before conversion.
-- The compat view public.campaign_sends depends on this column; drop it, alter
-- the type, then recreate. (The compat view itself is dropped for good in
-- migration 021 once the app has cut over.)
do $$
declare col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_schema='public' and table_name='campaign_send' and column_name='status';

  if col_type = 'text' then
    -- Normalize legacy values in place.
    execute $sanitize$
      update public.campaign_send
      set status = case
        when status = 'stubbed' then 'queued'
        when status = 'error'   then 'failed'
        when status = 'opened'  then 'delivered'
        when status = 'clicked' then 'delivered'
        when status is null     then 'queued'
        when status not in ('queued','sent','delivered','bounced','complaint','failed') then 'queued'
        else status
      end
    $sanitize$;

    -- Drop compat view (recreated below), drop default, alter type, restore default.
    drop view if exists public.campaign_sends;
    alter table public.campaign_send alter column status drop default;
    alter table public.campaign_send
      alter column status type public.send_status using status::public.send_status;
    alter table public.campaign_send alter column status set default 'queued'::public.send_status;
    alter table public.campaign_send alter column status set not null;

    -- Recreate the compat view (includes the new columns from this migration).
    execute $mkview$
      create view public.campaign_sends as
      select id, campaign_id, contact_id, person_id, recipient_email,
             provider, provider_message_id, status,
             sent_at, delivered_at, opened_at, clicked_at, bounced_at, complained_at,
             last_event_at, error, raw, created_at,
             subject, snapshot_id, stubbed_html, provider_events,
             opens, clicks,
             first_opened_at, last_opened_at, first_clicked_at, last_clicked_at, last_clicked_url
      from public.campaign_send
    $mkview$;
  end if;
end$$;

create index if not exists campaign_send_status_idx
  on public.campaign_send (status, campaign_id);
create index if not exists campaign_send_contact_id_idx
  on public.campaign_send (contact_id, sent_at desc);


-- ============================================================================
-- campaign_send_event: normalized, indexed, agent-queryable event stream
-- ============================================================================

create table if not exists public.campaign_send_event (
  id            uuid primary key default gen_random_uuid(),
  send_id       uuid not null references public.campaign_send(id) on delete cascade,
  event_kind    text not null,   -- 'sent'|'delivered'|'opened'|'clicked'|'bounced'|'complained'|'failed'|'unsubscribed'
  occurred_at   timestamptz not null default now(),
  url           text,            -- for click events
  user_agent    text,
  ip_address    inet,
  referrer      text,
  raw           jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  constraint campaign_send_event_kind_check check (event_kind in (
    'sent','delivered','opened','clicked','bounced','complained','failed','unsubscribed'
  ))
);
create index if not exists campaign_send_event_send_idx
  on public.campaign_send_event (send_id, event_kind, occurred_at);
create index if not exists campaign_send_event_kind_time_idx
  on public.campaign_send_event (event_kind, occurred_at desc);


-- ============================================================================
-- Rollup trigger: keep campaign_send counters/timestamps in sync
-- ============================================================================

create or replace function public.update_campaign_send_rollups()
returns trigger language plpgsql as $$
begin
  case new.event_kind
    when 'opened' then
      update public.campaign_send set
        opens = opens + 1,
        first_opened_at = coalesce(first_opened_at, new.occurred_at),
        last_opened_at  = greatest(coalesce(last_opened_at, new.occurred_at), new.occurred_at),
        opened_at       = coalesce(opened_at, new.occurred_at),
        last_event_at   = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
      where id = new.send_id;
    when 'clicked' then
      update public.campaign_send set
        clicks = clicks + 1,
        first_clicked_at = coalesce(first_clicked_at, new.occurred_at),
        last_clicked_at  = greatest(coalesce(last_clicked_at, new.occurred_at), new.occurred_at),
        last_clicked_url = coalesce(new.url, last_clicked_url),
        clicked_at       = coalesce(clicked_at, new.occurred_at),
        last_event_at    = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
      where id = new.send_id;
    when 'delivered' then
      update public.campaign_send set
        delivered_at   = coalesce(delivered_at, new.occurred_at),
        status         = case when status in ('queued'::public.send_status,'sent'::public.send_status)
                              then 'delivered'::public.send_status else status end,
        last_event_at  = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
      where id = new.send_id;
    when 'sent' then
      update public.campaign_send set
        sent_at        = coalesce(sent_at, new.occurred_at),
        status         = case when status = 'queued'::public.send_status
                              then 'sent'::public.send_status else status end,
        last_event_at  = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
      where id = new.send_id;
    when 'bounced' then
      update public.campaign_send set
        bounced_at     = coalesce(bounced_at, new.occurred_at),
        status         = 'bounced'::public.send_status,
        last_event_at  = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
      where id = new.send_id;
    when 'complained' then
      update public.campaign_send set
        complained_at  = coalesce(complained_at, new.occurred_at),
        status         = 'complaint'::public.send_status,
        last_event_at  = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
      where id = new.send_id;
    when 'failed' then
      update public.campaign_send set
        status         = 'failed'::public.send_status,
        last_event_at  = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at),
        error          = coalesce(error, new.raw->>'error')
      where id = new.send_id;
    when 'unsubscribed' then
      -- update contact's unsubscribe flag as a side-effect
      update public.contact
      set unsubscribed_all_email = true,
          unsubscribed_all       = true
      where id = (select contact_id from public.campaign_send where id = new.send_id);
      update public.campaign_send set
        last_event_at  = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
      where id = new.send_id;
    else null;
  end case;
  return new;
end;
$$;

drop trigger if exists campaign_send_event_rollup on public.campaign_send_event;
create trigger campaign_send_event_rollup
  after insert on public.campaign_send_event
  for each row execute function public.update_campaign_send_rollups();


-- ============================================================================
-- Backfill: if there are existing sends with legacy tracking, seed events.
-- (No-op if the app never wrote to those legacy fields.)
-- ============================================================================

insert into public.campaign_send_event (send_id, event_kind, occurred_at)
select id, 'sent'::text, sent_at from public.campaign_send
where sent_at is not null
  and not exists (
    select 1 from public.campaign_send_event
    where send_id = campaign_send.id and event_kind = 'sent'
  );

insert into public.campaign_send_event (send_id, event_kind, occurred_at)
select id, 'delivered'::text, delivered_at from public.campaign_send
where delivered_at is not null
  and not exists (
    select 1 from public.campaign_send_event
    where send_id = campaign_send.id and event_kind = 'delivered'
  );

insert into public.campaign_send_event (send_id, event_kind, occurred_at)
select id, 'opened'::text, opened_at from public.campaign_send
where opened_at is not null
  and not exists (
    select 1 from public.campaign_send_event
    where send_id = campaign_send.id and event_kind = 'opened'
  );

insert into public.campaign_send_event (send_id, event_kind, occurred_at)
select id, 'clicked'::text, clicked_at from public.campaign_send
where clicked_at is not null
  and not exists (
    select 1 from public.campaign_send_event
    where send_id = campaign_send.id and event_kind = 'clicked'
  );
