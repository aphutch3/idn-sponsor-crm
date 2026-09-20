begin;

-- ============================================================================
-- canonical-v4-speakers :: scheduling detail for a scraped conference session
-- ============================================================================
-- v3's signals.conference_session modelled a session as
-- (conference, title, abstract, session_date, track). The scraped source
-- carries five more fields on every one of its 551 rows, and the app reads
-- them, so dropping them would silently degrade the page.
--
-- Two of the five are free text and two are small closed sets. Values were
-- measured from the source rather than assumed:
--
--   day          551/551 non-null,  4 distinct  "Day 2 - Session Day 1"
--   time         551/551 non-null, 38 distinct  "11:40am-12:00pm"
--   room         551/551 non-null, 18 distinct  "Track 1"
--   status       551/551 non-null,  2 distinct  confirmed | tentative
--   session_type 551/551 non-null,  4 distinct  session | sponsor | keynote | workshop
--
-- day and time stay TEXT deliberately. "Day 2 - Session Day 1" is a label the
-- conference chose, not a date, and session_date already holds the real date.
-- "11:40am-12:00pm" is a local wall-clock range with no date or zone attached;
-- parsing it into timestamptz would require inventing a timezone, so it is
-- preserved verbatim as the label it is.
--
-- status and session_type get CHECK constraints rather than enums: they are
-- vocabularies owned by an upstream site that may add a value, and extending a
-- CHECK is a cheap ALTER while adding an enum label is not transactional in
-- the same way.
--
-- spk_sessions.topics is NOT migrated. It is non-null on 0 of 551 rows -- a
-- dead column. Speaker topics (1757 mentions, 716 distinct) live on the person
-- instead, as public.tag + public.entity_tag rows.
-- ============================================================================

alter table signals.conference_session
  add column day_label    text,
  add column time_label   text,
  add column room         text,
  add column session_type text,
  add column status       text;

alter table signals.conference_session
  add constraint conference_session_type_ck check (
    session_type is null
    or session_type in ('session', 'sponsor', 'keynote', 'workshop')),
  add constraint conference_session_status_ck check (
    status is null or status in ('confirmed', 'tentative'));

-- The session list is filtered by conference and read in schedule order.
create index conference_session_schedule_idx
  on signals.conference_session (conference_id, session_date, day_label);

-- Sponsor sessions are the commercially interesting slice and are queried on
-- their own; the other three types are the bulk, so a partial index is enough.
create index conference_session_sponsor_idx
  on signals.conference_session (conference_id)
  where session_type = 'sponsor';

insert into meta.column_annotation
  (schema_name, table_name, column_name, meaning, authority, null_meaning,
   unit, pii_class, is_derived)
values
  ('signals','conference_session','day_label','Conference day label as published, e.g. "Day 2 - Session Day 1". Not a date; session_date holds the date.','source-of-record','no day published',null,'none',false),
  ('signals','conference_session','time_label','Published local wall-clock range, e.g. "11:40am-12:00pm". Kept verbatim because the source supplies no date or timezone.','source-of-record','no time published',null,'none',false),
  ('signals','conference_session','room','Room or stage the session was scheduled in.','source-of-record','no room published',null,'none',false),
  ('signals','conference_session','session_type','Session format: session, sponsor, keynote or workshop.','source-of-record','format not published',null,'none',false),
  ('signals','conference_session','status','Whether the slot is confirmed or still tentative.','source-of-record','status not published',null,'none',false)
on conflict do nothing;

commit;
