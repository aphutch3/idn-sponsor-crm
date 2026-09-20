-- 96_conference_participation.sql
--
-- Three legacy relations were missed by the first speaker load because they
-- are reachable only through views, so a column survey of the base tables
-- never saw them: spk_conference_people (698), spk_conference_companies (594)
-- and spk_company_people (612).
--
-- spk_company_people needs no table. It was measured to be exactly the set of
-- (company_id, person_id) pairs already implied by spk_people.company_id --
-- 612 of 612, identical -- so it is stored duplicate state and is projected
-- as a compat view instead of being carried across.
--
-- The other two are real, and neither is derivable from session_speaker:
-- only one of the three conferences publishes sessions at all, so 195 of 698
-- speakers and 304 of 594 company appearances exist nowhere else. Without
-- these tables every "which conferences was this company at" answer silently
-- collapses to one conference.
--
-- The important normalization point is that SPONSORSHIP IS PER EVENT. A
-- company can sponsor one summit and merely exhibit at the next, and the
-- legacy per-conference rows prove this is not hypothetical: the per-event
-- flags disagree with the company-level summary for 11 companies on
-- is_sponsor, 11 on is_exhibitor, 18 on sponsor_tier and 17 on booth. Storing
-- a single company-level tier would force one of those two readings to be
-- wrong. speaker_company_profile keeps its company-level columns because the
-- legacy app reads them and they are independently authored judgement, but
-- the per-conference rows here are the finer-grained truth.

-- --------------------------------------------------- conference_participant
create table if not exists signals.conference_participant (
  conference_id      uuid not null
    references signals.conference (id) on delete cascade,
  speaker_profile_id uuid not null
    references signals.speaker_profile (id) on delete cascade,
  participant_role   text,
  is_speaker         boolean not null default true,
  created_at         timestamptz not null default now(),
  primary key (conference_id, speaker_profile_id)
);

create index if not exists conference_participant_profile_idx
  on signals.conference_participant (speaker_profile_id);

-- ------------------------------------------------------- conference_company
create table if not exists signals.conference_company (
  conference_id  uuid not null
    references signals.conference (id) on delete cascade,
  company_id     uuid not null
    references public.company (id) on delete cascade,
  is_sponsor     boolean not null default false,
  is_exhibitor   boolean not null default false,
  sponsor_tier   text,
  booth          text,
  score_overall  numeric,
  created_at     timestamptz not null default now(),
  primary key (conference_id, company_id),
  constraint conference_company_tier_needs_sponsor
    check (sponsor_tier is null or is_sponsor or is_exhibitor)
);

create index if not exists conference_company_company_idx
  on signals.conference_company (company_id);

-- The legacy notes column is dropped rather than carried: it was non-null on
-- 0 of 594 rows, so migrating it would move an empty column, not data.

-- ------------------------------------------------------------- annotations
insert into meta.object_annotation
  (schema_name, object_name, object_kind, purpose, row_grain, owning_domain,
   authority, pii_class, lifecycle_state)
values
  ('signals', 'conference_participant', 'table',
   'Which speakers appeared at which conference, independent of whether that '
   'conference published a session agenda.',
   'one row per conference and speaker profile', 'signals', 'source',
   'none', 'active'),
  ('signals', 'conference_company', 'table',
   'Per-conference company participation and sponsorship. Sponsorship is an '
   'event-level fact, not a company-level one.',
   'one row per conference and company', 'signals', 'source',
   'none', 'active')
on conflict (schema_name, object_name) do update
  set purpose = excluded.purpose, row_grain = excluded.row_grain;

insert into meta.column_annotation
  (schema_name, table_name, column_name, meaning, authority, null_meaning,
   unit, pii_class, is_derived)
values
  ('signals','conference_participant','conference_id','Conference attended.','source',null,null,'none',false),
  ('signals','conference_participant','speaker_profile_id','Speaker who appeared.','source',null,null,'none',false),
  ('signals','conference_participant','participant_role','Published role, e.g. speaker. Null where the source listed no role.','source','source published no role',null,'none',false),
  ('signals','conference_participant','is_speaker','Whether this appearance was a speaking slot.','source',null,null,'none',false),
  ('signals','conference_participant','created_at','When this row was written.','system',null,null,'none',false),
  ('signals','conference_company','conference_id','Conference the company appeared at.','source',null,null,'none',false),
  ('signals','conference_company','company_id','Company that appeared.','source',null,null,'none',false),
  ('signals','conference_company','is_sponsor','Sponsored this specific event.','source',null,null,'none',false),
  ('signals','conference_company','is_exhibitor','Exhibited at this specific event.','source',null,null,'none',false),
  ('signals','conference_company','sponsor_tier','Sponsorship tier at this event. Tiers are event-specific and are not comparable across conferences.','source','not a sponsor at this event, or tier unpublished',null,'none',false),
  ('signals','conference_company','booth','Booth identifier at this event.','source','no booth at this event',null,'none',false),
  ('signals','conference_company','score_overall','Sponsor-fit score as scored for this event.','derived','not scored for this event','score','none',true),
  ('signals','conference_company','created_at','When this row was written.','system',null,null,'none',false)
on conflict (schema_name, table_name, column_name) do update
  set meaning = excluded.meaning, authority = excluded.authority,
      null_meaning = excluded.null_meaning, is_derived = excluded.is_derived;
