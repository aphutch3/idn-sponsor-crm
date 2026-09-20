begin;

-- ============================================================================
-- canonical-v4-speakers :: app-scoped speaker-CRM enrichment for companies
-- ============================================================================
-- v3 gave people an app-scoped profile (signals.speaker_profile) but gave
-- companies none, so the ~20 Speaker-CRM-specific company attributes had
-- nowhere normalized to live.
--
-- They are NOT added to public.company. public.company is the canonical object
-- shared by every application; a column like score_sponsor_likelihood is an
-- opinion this one app holds about a company, not a fact about the company.
-- Putting app opinions on the shared object is exactly the duplication the
-- canonical model exists to prevent, and it would force every other app to
-- carry columns it must ignore.
--
-- They are NOT stuffed into company.raw either. raw is the unmodelled landing
-- area for source payloads; a value the app filters and sorts by needs a typed,
-- constrained, indexable column.
--
-- So: a one-to-one table keyed on the canonical company, in the app's own
-- schema. The company exists once; the app's view of it is an optional
-- extension that cascades away with the company.
-- ============================================================================

create table signals.speaker_company_profile (
  company_id uuid primary key
    references public.company(id) on delete cascade,

  -- Sourcing / provenance
  source_url              text,
  synced_at               timestamptz,

  -- Speaker-CRM classification
  category                text,
  segment                 text,
  is_vendor               boolean,
  is_exhibitor            boolean not null default false,
  is_sponsor              boolean not null default false,
  booth                   text,

  -- Fit scoring. Every score is 0-100 so they stay comparable; the source
  -- system produced them on that scale and a mixed scale would make the
  -- composite meaningless.
  score_overall             numeric,
  score_audience_fit        numeric,
  score_enterprise_fit      numeric,
  score_topic_fit           numeric,
  score_sponsor_likelihood  numeric,
  score_urgency             numeric,

  -- Generated sales narrative
  best_fit_summit         text,
  summit_fit_summary      text,
  outreach_angle          text,
  suggested_pitch         text,
  target_buyer            text,
  product_positioning     text,

  -- Firmographics the CRM captured but the canonical company does not model
  -- in this shape (public.company has employee_count_band / hq_city).
  employee_range          text,
  hq_location             text,

  enriched_at             timestamptz,
  raw                     jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint speaker_company_score_range check (
    coalesce(score_overall,            0) between 0 and 100 and
    coalesce(score_audience_fit,       0) between 0 and 100 and
    coalesce(score_enterprise_fit,     0) between 0 and 100 and
    coalesce(score_topic_fit,          0) between 0 and 100 and
    coalesce(score_sponsor_likelihood, 0) between 0 and 100 and
    coalesce(score_urgency,            0) between 0 and 100
  )
);

-- The app's default listing is "best prospects first", and it filters to
-- sponsors/exhibitors and by segment. Partial index: rows with no score are
-- never at the top of that listing, so they do not belong in the index.
create index speaker_company_profile_score_idx
  on signals.speaker_company_profile (score_overall desc nulls last)
  where score_overall is not null;

create index speaker_company_profile_segment_idx
  on signals.speaker_company_profile (segment)
  where segment is not null;

create trigger speaker_company_profile_touch
  before update on signals.speaker_company_profile
  for each row execute function public.tg_touch_updated_at();

-- ---------------------------------------------------------------- annotations
-- meta.table_catalog / meta.column_catalog are VIEWS; a new object becomes
-- catalogued only by inserting annotations here. The release gate fails on any
-- undocumented column, so this block is not optional.
insert into meta.object_annotation
  (schema_name, object_name, object_kind, purpose, row_grain,
   owning_domain, authority, pii_class, lifecycle_state)
values
  ('signals', 'speaker_company_profile', 'table',
   'Speaker-CRM opinion of a canonical company: fit scores, segment and '
   'generated sales narrative. Extension of public.company, never a copy of it.',
   'One canonical company', 'signals', 'app-owned', 'none', 'active')
on conflict do nothing;

insert into meta.column_annotation
  (schema_name, table_name, column_name, meaning, authority, null_meaning,
   unit, pii_class, is_derived)
values
  ('signals','speaker_company_profile','company_id','Canonical company this profile extends.','app-owned','not null',null,'none',false),
  ('signals','speaker_company_profile','source_url','Conference page the company was discovered on.','app-owned','discovered without a source page',null,'none',false),
  ('signals','speaker_company_profile','synced_at','When the source system last resynced this company.','app-owned','never synced',null,'none',false),
  ('signals','speaker_company_profile','category','Speaker-CRM product category label.','app-owned','uncategorised',null,'none',false),
  ('signals','speaker_company_profile','segment','Audience segment used to group prospects.','app-owned','unsegmented',null,'none',true),
  ('signals','speaker_company_profile','is_vendor','Company sells to the summit audience rather than attending it.','app-owned','unknown',null,'none',true),
  ('signals','speaker_company_profile','is_exhibitor','Company exhibited at a tracked conference.','app-owned','not null',null,'none',false),
  ('signals','speaker_company_profile','is_sponsor','Company sponsored a tracked conference.','app-owned','not null',null,'none',false),
  ('signals','speaker_company_profile','booth','Exhibitor booth identifier at the source conference.','app-owned','no booth recorded',null,'none',false),
  ('signals','speaker_company_profile','score_overall','Composite prospect score.','app-owned','not scored','0-100','none',true),
  ('signals','speaker_company_profile','score_audience_fit','Fit between the company and the summit audience.','app-owned','not scored','0-100','none',true),
  ('signals','speaker_company_profile','score_enterprise_fit','Fit between the company and enterprise buyers.','app-owned','not scored','0-100','none',true),
  ('signals','speaker_company_profile','score_topic_fit','Fit between the company and summit topics.','app-owned','not scored','0-100','none',true),
  ('signals','speaker_company_profile','score_sponsor_likelihood','Estimated likelihood the company sponsors.','app-owned','not scored','0-100','none',true),
  ('signals','speaker_company_profile','score_urgency','Estimated urgency of outreach.','app-owned','not scored','0-100','none',true),
  ('signals','speaker_company_profile','best_fit_summit','Summit this company fits best.','app-owned','no summit identified',null,'none',true),
  ('signals','speaker_company_profile','summit_fit_summary','Generated rationale for the summit fit.','app-owned','not generated',null,'none',true),
  ('signals','speaker_company_profile','outreach_angle','Generated outreach angle.','app-owned','not generated',null,'none',true),
  ('signals','speaker_company_profile','suggested_pitch','Generated pitch.','app-owned','not generated',null,'none',true),
  ('signals','speaker_company_profile','target_buyer','Buyer persona the company sells to.','app-owned','unknown',null,'none',true),
  ('signals','speaker_company_profile','product_positioning','How the company positions its product.','app-owned','not generated',null,'none',true),
  ('signals','speaker_company_profile','employee_range','Headcount band as the source system recorded it.','app-owned','unknown',null,'none',false),
  ('signals','speaker_company_profile','hq_location','Headquarters as a single source string.','app-owned','unknown',null,'none',false),
  ('signals','speaker_company_profile','enriched_at','When enrichment last produced the scores and narrative.','app-owned','never enriched',null,'none',false),
  ('signals','speaker_company_profile','raw','Unmodelled source payload.','app-owned','not null',null,'none',false),
  ('signals','speaker_company_profile','created_at','Row creation time.','app-owned','not null',null,'none',false),
  ('signals','speaker_company_profile','updated_at','Row last-modified time, maintained by trigger.','app-owned','not null',null,'none',true)
on conflict do nothing;

commit;
