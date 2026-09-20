-- canonical-v4-speakers / 92_speaker_classification.sql
--
-- Two gaps found by diffing the legacy read surface against canonical:
--
-- 1. signals.conference dropped location and description. Both are present on
--    all three source conferences and location is read by the app's conference
--    view, so omitting it would silently blank a populated field.
--
-- 2. The legacy vendor/segment classification lives in its own table
--    (spk_company_segments, 558 rows) that the earlier column survey missed
--    because it was reached only through a view. segment and is_vendor already
--    exist on signals.speaker_company_profile, but the evidence that justifies
--    the classification -- confidence, method, rationale -- had nowhere to
--    land. That evidence is the whole point of the classification: a 0.55
--    confidence rules-based guess and a 1.0 human override are not
--    interchangeable, and a reviewer cannot tell them apart without it.
--
--    Measured: segment is NOT derivable from category. 22 of 225 categories
--    map to conflicting segments ("Technology" appears under four different
--    segments), so this is stored judgement, not a lookup, and it has to be
--    carried across rather than recomputed.
--
-- Idempotent: every statement is add-if-not-exists.

begin;

-- ---------------------------------------------------------------- conference
alter table signals.conference
  add column if not exists location    text,
  add column if not exists description text;

-- ------------------------------------------------- classification provenance
alter table signals.speaker_company_profile
  add column if not exists subsegment    text,
  add column if not exists confidence    numeric,
  add column if not exists method        text,
  add column if not exists rationale     text,
  add column if not exists classified_at timestamptz;

-- A confidence outside 0..1 is meaningless, so reject it at the boundary
-- rather than letting a bad writer poison downstream ranking.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'speaker_company_profile_confidence_ck'
  ) then
    alter table signals.speaker_company_profile
      add constraint speaker_company_profile_confidence_ck
      check (confidence is null or (confidence >= 0 and confidence <= 1));
  end if;
end $$;

-- method is a small closed vocabulary today. CHECK rather than enum so adding
-- a classifier later is a cheap ALTER instead of a type migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'speaker_company_profile_method_ck'
  ) then
    alter table signals.speaker_company_profile
      add constraint speaker_company_profile_method_ck
      check (method is null or method in ('rules', 'llm', 'override'));
  end if;
end $$;

-- Segment rollups are a primary read (v_spk_segments) and the vendor split
-- gates most company lists, so index the two columns those queries filter on.
create index if not exists speaker_company_profile_segment_idx
  on signals.speaker_company_profile (segment)
  where segment is not null;

create index if not exists speaker_company_profile_vendor_idx
  on signals.speaker_company_profile (is_vendor, segment);

-- ------------------------------------------------------------- annotations
insert into meta.column_annotation
  (schema_name, table_name, column_name, meaning, authority, null_meaning,
   unit, pii_class, is_derived)
values
  ('signals', 'conference', 'location',
   'Venue or city as published by the conference, e.g. "The Venetian, Las Vegas". Free text because the source mixes venue, city and region.',
   'source', 'Location not published or not captured', null, 'none', false),
  ('signals', 'conference', 'description',
   'Short editorial summary of the conference used in listing surfaces.',
   'derived', 'No summary written yet', null, 'none', false),
  ('signals', 'speaker_company_profile', 'subsegment',
   'Optional finer-grained split within segment.',
   'derived', 'No subsegment assigned', null, 'none', false),
  ('signals', 'speaker_company_profile', 'confidence',
   'Classifier confidence in the segment and is_vendor assignment. 1.0 indicates a human override.',
   'derived', 'Classification not scored', 'ratio_0_1', 'none', true),
  ('signals', 'speaker_company_profile', 'method',
   'How the classification was produced: rules, llm, or override (human). Determines how much to trust segment and is_vendor.',
   'derived', 'Classification provenance unknown', null, 'none', true),
  ('signals', 'speaker_company_profile', 'rationale',
   'Written justification for the segment and is_vendor assignment, kept so a reviewer can audit the call without re-running the classifier.',
   'derived', 'No rationale recorded', null, 'none', true),
  ('signals', 'speaker_company_profile', 'classified_at',
   'When the classification was last produced. Lets a stale classification be found and refreshed.',
   'derived', 'Never classified', null, 'none', true)
on conflict (schema_name, table_name, column_name) do update
  set meaning      = excluded.meaning,
      authority    = excluded.authority,
      null_meaning = excluded.null_meaning,
      unit         = excluded.unit,
      pii_class    = excluded.pii_class,
      is_derived   = excluded.is_derived;

commit;
