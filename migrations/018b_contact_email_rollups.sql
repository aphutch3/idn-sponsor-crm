-- Phase 8 · Step 1c — Real email-aggregate columns on contact with trigger from campaign_send_event.
-- Reads become simple; the send-event trigger updates contact rollups atomically.

alter table public.contact
  add column if not exists emails_delivered      integer not null default 0,
  add column if not exists emails_opened         integer not null default 0,
  add column if not exists emails_clicked        integer not null default 0,
  add column if not exists last_email_send_date  timestamptz;

-- Backfill from existing campaign_send state.
update public.contact c
set emails_delivered = agg.delivered,
    emails_opened    = agg.opens,
    emails_clicked   = agg.clicks,
    last_email_send_date = agg.last_send
from (
  select contact_id,
         count(*) filter (where delivered_at is not null)::int as delivered,
         coalesce(sum(opens), 0)::int as opens,
         coalesce(sum(clicks), 0)::int as clicks,
         max(sent_at) as last_send
  from public.campaign_send
  where contact_id is not null
  group by contact_id
) agg
where c.id = agg.contact_id;

-- Extend the send-event trigger to also update contact rollups.
create or replace function public.update_campaign_send_rollups()
returns trigger
language plpgsql
as $$
declare
  cs record;
  contact_delivered_increment integer := 0;
  contact_opens_increment integer := 0;
  contact_clicks_increment integer := 0;
  is_first_event_of_kind boolean;
begin
  -- Only handle inserts.
  if TG_OP <> 'INSERT' then
    return new;
  end if;

  -- Fetch the send row.
  select * into cs from public.campaign_send where id = new.send_id;
  if not found then
    return new;
  end if;

  -- Determine per-kind first-event-of-its-kind (before this insert).
  select not exists(
    select 1 from public.campaign_send_event
    where send_id = new.send_id and event_kind = new.event_kind and id <> new.id
  ) into is_first_event_of_kind;

  -- Update the campaign_send rollups + status.
  if new.event_kind = 'sent' then
    update public.campaign_send
       set status = 'sent',
           sent_at = coalesce(sent_at, new.occurred_at),
           last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
     where id = new.send_id;
  elsif new.event_kind = 'delivered' then
    update public.campaign_send
       set status = case when status in ('queued','sent') then 'delivered'::send_status else status end,
           delivered_at = coalesce(delivered_at, new.occurred_at),
           last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
     where id = new.send_id;
    if is_first_event_of_kind then contact_delivered_increment := 1; end if;
  elsif new.event_kind = 'opened' then
    update public.campaign_send
       set opens = opens + 1,
           first_opened_at = coalesce(first_opened_at, new.occurred_at),
           last_opened_at = greatest(coalesce(last_opened_at, new.occurred_at), new.occurred_at),
           last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
     where id = new.send_id;
    contact_opens_increment := 1;
  elsif new.event_kind = 'clicked' then
    update public.campaign_send
       set clicks = clicks + 1,
           first_clicked_at = coalesce(first_clicked_at, new.occurred_at),
           last_clicked_at = greatest(coalesce(last_clicked_at, new.occurred_at), new.occurred_at),
           last_clicked_url = coalesce(new.url, last_clicked_url),
           last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
     where id = new.send_id;
    contact_clicks_increment := 1;
  elsif new.event_kind = 'bounced' then
    update public.campaign_send
       set status = 'bounced'::send_status,
           bounced_at = coalesce(bounced_at, new.occurred_at),
           last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
     where id = new.send_id;
  elsif new.event_kind = 'complaint' then
    update public.campaign_send
       set status = 'complaint'::send_status,
           complained_at = coalesce(complained_at, new.occurred_at),
           last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
     where id = new.send_id;
  elsif new.event_kind = 'failed' then
    update public.campaign_send
       set status = 'failed'::send_status,
           last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
     where id = new.send_id;
  elsif new.event_kind = 'unsubscribed' then
    if cs.contact_id is not null then
      update public.contact set unsubscribed_all = true, unsubscribed_all_email = true
       where id = cs.contact_id;
    end if;
    update public.campaign_send
       set last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
     where id = new.send_id;
  end if;

  -- Update contact rollups.
  if cs.contact_id is not null and (contact_delivered_increment > 0 or contact_opens_increment > 0 or contact_clicks_increment > 0) then
    update public.contact
       set emails_delivered = emails_delivered + contact_delivered_increment,
           emails_opened    = emails_opened + contact_opens_increment,
           emails_clicked   = emails_clicked + contact_clicks_increment,
           last_email_open_date  = case when new.event_kind = 'opened'   then greatest(coalesce(last_email_open_date,  new.occurred_at), new.occurred_at) else last_email_open_date end,
           last_email_click_date = case when new.event_kind = 'clicked'  then greatest(coalesce(last_email_click_date, new.occurred_at), new.occurred_at) else last_email_click_date end,
           last_activity_date    = greatest(coalesce(last_activity_date, new.occurred_at), new.occurred_at)
     where id = cs.contact_id;
  end if;

  return new;
end;
$$;

-- Re-drop and re-create the views that expose the columns so v_contact / v_key_contacts include them.
drop view if exists public.v_key_contacts cascade;
drop view if exists public.v_contact cascade;

create view public.v_contact as
select
  c.id,
  c.first_name,
  c.last_name,
  coalesce(c.full_name, trim(concat(c.first_name, ' ', c.last_name))) as full_name,
  c.email,
  c.job_title,
  c.linkedin_url,
  c.phone,
  c.twitter_username,
  c.lead_status,
  c.owner,
  c.key_contact,
  c.unsubscribed_all,
  c.unsubscribed_all_email,
  c.last_email_open_date,
  c.last_email_click_date,
  c.last_email_send_date,
  c.last_activity_date,
  c.emails_delivered,
  c.emails_opened,
  c.emails_clicked,
  c.emails_replied,
  c.company_id,
  co.name    as company_name,
  co.website_url as company_website,
  co.domain  as company_domain,
  co.sponsor_tier      as company_sponsor_tier,
  co.sponsor_tier_rank as company_sponsor_tier_rank,
  co."group"           as company_group,
  co.subcategory       as company_subcategory,
  c.created_at,
  c.updated_at
from public.contact c
left join public.company co on co.id = c.company_id;

create view public.v_key_contacts as
select
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  c.job_title,
  c.key_contact,
  c.lead_status,
  co.name as company_name,
  c.company_id,
  co.sponsor_tier,
  c.emails_delivered,
  c.emails_opened,
  c.emails_clicked,
  c.emails_replied,
  c.last_email_send_date,
  c.unsubscribed_all_email
from public.contact c
left join public.company co on co.id = c.company_id
where c.key_contact is not null and array_length(c.key_contact, 1) > 0;
