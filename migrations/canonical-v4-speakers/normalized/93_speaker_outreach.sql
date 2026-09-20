-- canonical-v4-speakers / 93_speaker_outreach.sql
--
-- Closes the person-side gap found by diffing v_spk_people against canonical.
--
-- Most legacy speaker fields already have a canonical home and must NOT be
-- duplicated here:
--   photo_url, buying_influence  -> public.person (already present)
--   email, linkedin              -> public.person
--   x_url, linkedin              -> signals.platform_account, referenced by
--                                   speaker_profile.x_account_id /
--                                   linkedin_account_id
--   topics                       -> public.tag + public.entity_tag
--
-- What genuinely has nowhere to live is IDN's own outreach judgement about a
-- speaker. It is not a fact about the person -- it is this company's
-- commercial assessment of them for a specific summit -- so it belongs on
-- speaker_profile, not on public.person, which is shared by every app.
--
-- title_verified / title_verification_note are kept separate from
-- speaker_profile.title on purpose: title is what the conference published,
-- title_verified is what verification concluded. Collapsing them would
-- destroy the ability to see that the two disagree, which is the only reason
-- the verification was run.
--
-- Idempotent: every statement is add-if-not-exists.

begin;

alter table signals.speaker_profile
  add column if not exists bio_summary             text,
  add column if not exists sponsor_relevance_notes text,
  add column if not exists suggested_email_angle   text,
  add column if not exists title_verified          text,
  add column if not exists title_verification_note text,
  add column if not exists is_speaker              boolean not null default true,
  add column if not exists synced_at               timestamptz;

-- Speaker lists are read per conference and filtered to actual speakers, and
-- the company rollups join on company_id, so both get an index.
create index if not exists speaker_profile_company_idx
  on signals.speaker_profile (company_id)
  where company_id is not null;

create index if not exists speaker_profile_person_idx
  on signals.speaker_profile (person_id)
  where person_id is not null;

insert into meta.column_annotation
  (schema_name, table_name, column_name, meaning, authority, null_meaning,
   unit, pii_class, is_derived)
values
  ('signals', 'speaker_profile', 'bio_summary',
   'Condensed one-paragraph version of bio, generated for scanning long speaker lists.',
   'derived', 'Not summarised', null, 'none', true),
  ('signals', 'speaker_profile', 'sponsor_relevance_notes',
   'Why this speaker matters to IDN sponsor outreach. Commercial judgement, not a fact about the person.',
   'derived', 'Not assessed', null, 'none', true),
  ('signals', 'speaker_profile', 'suggested_email_angle',
   'Proposed opening angle for outreach to this speaker. A draft for a human to edit, never sent unreviewed.',
   'derived', 'No angle drafted', null, 'none', true),
  ('signals', 'speaker_profile', 'title_verified',
   'Job title after verification against a second source. Deliberately separate from title, which is what the conference published, so a disagreement between the two stays visible.',
   'derived', 'Title never verified', null, 'none', true),
  ('signals', 'speaker_profile', 'title_verification_note',
   'What verification found, e.g. "matches provided title". Explains why title and title_verified agree or differ.',
   'derived', 'Title never verified', null, 'none', true),
  ('signals', 'speaker_profile', 'is_speaker',
   'True when the person actually appeared on stage, as opposed to being captured only as a company contact.',
   'source', null, null, 'none', false),
  ('signals', 'speaker_profile', 'synced_at',
   'When this profile was last refreshed from the conference source.',
   'source', 'Never synced from source', null, 'none', false)
on conflict (schema_name, table_name, column_name) do update
  set meaning      = excluded.meaning,
      authority    = excluded.authority,
      null_meaning = excluded.null_meaning,
      unit         = excluded.unit,
      pii_class    = excluded.pii_class,
      is_derived   = excluded.is_derived;

commit;
