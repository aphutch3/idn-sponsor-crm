-- 012_plural_aliases.sql
--
-- Compatibility layer for the Engager app cutover to Neon canonical.
--
-- Purpose:
--   The canonical schema (migrations 001-011) uses SINGULAR table names
--   (contact, company, list, tag, ...) as a deliberate design choice.
--   The current Engager app codebase references PLURAL names (contacts,
--   companies, lists, tags, ...) inherited from its original Supabase
--   schema. This migration adds plural-name views over the singular
--   canonical tables so the app runs unchanged during cutover.
--
--   Views listed as "identity views" are 1:1 SELECT * and are automatically
--   updatable — INSERT/UPDATE/DELETE flow through to the base table.
--
--   The "contacts" view adds computed columns for fields the canonical
--   schema deliberately dropped (key_contact from entity_tag; email
--   counters from campaign_send). The added columns are read-only; the
--   underlying base-table columns remain updatable through the view.
--
-- These views are compatibility shims, not part of the canonical design.
-- They should be dropped when the app is refactored to use canonical
-- singular table names + normalized related-table queries (planned as
-- a Phase 2 app refactor).
--
-- Idempotent: uses CREATE OR REPLACE VIEW / DROP + CREATE where required.

set search_path = public;

-- ---------- Identity views (1:1, automatically updatable) --------------- --

create or replace view public.activities                as select * from public.activity;
create or replace view public.agent_runs                as select * from public.agent_run;
create or replace view public.campaign_sends            as select * from public.campaign_send;
create or replace view public.companies                 as select * from public.company;
create or replace view public.enrichments               as select * from public.enrichment;
create or replace view public.linkedin_monitor_configs  as select * from public.linkedin_monitor_config;
create or replace view public.linkedin_posts            as select * from public.linkedin_post;
create or replace view public.linkedin_snapshots        as select * from public.linkedin_snapshot;
create or replace view public.linkedin_topic_tags       as select * from public.linkedin_topic_tag;
create or replace view public.list_bindings             as select * from public.list_binding;
create or replace view public.list_members              as select * from public.list_member;
create or replace view public.lists                     as select * from public.list;
create or replace view public.social_mentions           as select * from public.social_mention;
create or replace view public.tasks                     as select * from public.task;
create or replace view public.tags                      as select * from public.tag;

-- ---------- Shape-restoring view: contacts ------------------------------ --
--
-- contact + key_contact (from entity_tag) + email counters (from campaign_send).
-- App queries filter, sort, and count on these fields. Writes to the added
-- columns are NOT supported (they're computed). The app does not currently
-- write these fields, so this is not a regression.
--
-- Uses DROP + CREATE because we're changing the shape (columns), not just
-- the definition; CREATE OR REPLACE VIEW requires the column list to match.

drop view if exists public.contacts;
create view public.contacts as
select
  c.*,
  coalesce(
    (
      select array_agg(distinct upper(t.slug))
      from public.entity_tag et
      join public.tag t on t.id = et.tag_id
      where et.entity_table = 'contact'
        and et.entity_id    = c.id
    ),
    '{}'::text[]
  )                                                                                  as key_contact,
  coalesce((select count(*)::int from public.campaign_send cs where cs.contact_id = c.id and cs.opened_at    is not null), 0) as emails_opened,
  coalesce((select count(*)::int from public.campaign_send cs where cs.contact_id = c.id and cs.clicked_at   is not null), 0) as emails_clicked,
  coalesce((select count(*)::int from public.campaign_send cs where cs.contact_id = c.id and cs.delivered_at is not null), 0) as emails_delivered,
  coalesce((select count(*)::int from public.campaign_send cs where cs.contact_id = c.id and cs.bounced_at   is not null), 0) as emails_bounced,
  0::int                                                                             as emails_replied
from public.contact c;

-- ---------- Comments ---------------------------------------------------- --

comment on view public.activities               is 'Compat alias for canonical singular table activity. Drop after Phase 2 app refactor.';
comment on view public.agent_runs               is 'Compat alias for canonical singular table agent_run. Drop after Phase 2 app refactor.';
comment on view public.campaign_sends           is 'Compat alias for canonical singular table campaign_send. Drop after Phase 2 app refactor.';
comment on view public.companies                is 'Compat alias for canonical singular table company. Drop after Phase 2 app refactor.';
comment on view public.contacts                 is 'Compat view over canonical singular table contact. Adds computed key_contact (from entity_tag), emails_opened/clicked/delivered/bounced (from campaign_send), emails_replied=0. Read-only for added columns. Drop after Phase 2 app refactor.';
comment on view public.enrichments              is 'Compat alias for canonical singular table enrichment. Drop after Phase 2 app refactor.';
comment on view public.linkedin_monitor_configs is 'Compat alias for canonical singular table linkedin_monitor_config. Drop after Phase 2 app refactor.';
comment on view public.linkedin_posts           is 'Compat alias for canonical singular table linkedin_post. Drop after Phase 2 app refactor.';
comment on view public.linkedin_snapshots       is 'Compat alias for canonical singular table linkedin_snapshot. Drop after Phase 2 app refactor.';
comment on view public.linkedin_topic_tags      is 'Compat alias for canonical singular table linkedin_topic_tag. Drop after Phase 2 app refactor.';
comment on view public.list_bindings            is 'Compat alias for canonical singular table list_binding. Drop after Phase 2 app refactor.';
comment on view public.list_members             is 'Compat alias for canonical singular table list_member. Drop after Phase 2 app refactor.';
comment on view public.lists                    is 'Compat alias for canonical singular table list. Drop after Phase 2 app refactor.';
comment on view public.social_mentions          is 'Compat alias for canonical singular table social_mention. Drop after Phase 2 app refactor.';
comment on view public.tasks                    is 'Compat alias for canonical singular table task. Drop after Phase 2 app refactor.';
comment on view public.tags                     is 'Compat alias for canonical singular table tag. Drop after Phase 2 app refactor.';
