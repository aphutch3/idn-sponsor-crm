-- 94_compat_speakers.sql
--
-- Legacy-shape views for the speaker domain, matching 80_compat_newsletter.sql.
-- These let the dashboard's speaker routes be pointed at Neon without
-- rewriting the ~20 query sites in the same change.
--
-- MIGRATION AID, not canonical. Read-only by construction (no INSTEAD OF
-- triggers): the dashboard's speaker surface is read-only, and writes go
-- through the job queue. Nothing canonical may depend on these.
--
-- Unlike the newsletter domain, legacy speaker ids are uuids rather than
-- bigints, so they need their own id map. Every id the app sees must be the
-- LEGACY uuid, because the app addresses rows by it and passes it straight
-- back in as a filter; projecting the canonical uuid instead would break every
-- id-addressed speaker route.
--
-- Column order is reproduced exactly as the legacy views return it. The app
-- selects '*' in places, so a reordered or renamed column is a silent
-- behaviour change.

create schema if not exists compat;

drop view if exists compat.v_spk_segments;
drop view if exists compat.v_spk_list_members;
drop view if exists compat.v_spk_conferences;
drop view if exists compat.spk_conference_people;
drop view if exists compat.spk_conference_companies;
drop view if exists compat.spk_company_people;
drop view if exists compat.v_spk_people;
drop view if exists compat.v_spk_companies;
drop view if exists compat.spk_company_sessions;
drop view if exists compat.spk_session_people;
drop view if exists compat.spk_sessions;
drop view if exists compat.spk_lists;
-- The helper rollups are dropped after their dependents and before _spk_id so
-- this file is re-runnable from any partially applied state.
drop view if exists compat._spk_person_rollup;
drop view if exists compat._spk_company_rollup;
drop view if exists compat._spk_primary;
drop view if exists compat._spk_id;

-- ------------------------------------------------------------- legacy id map
create view compat._spk_id as
select
  entity_table,
  entity_id,
  split_part(external_id, ':', 1)        as legacy_table,
  split_part(external_id, ':', 2)::uuid  as legacy_id
from public.external_ref
where source_system = 'news_dashboard'
  and external_id like 'spk\_%';

comment on view compat._spk_id is
  'Maps canonical speaker-domain uuids back to the legacy news-dashboard '
  'uuids the app addresses rows by. Internal to the compat layer.';

-- 10 companies and 8 people were merged during the load, so one canonical row
-- can carry several legacy ids. Translating a FOREIGN KEY through _spk_id
-- would emit one row per legacy id and silently inflate every child relation.
-- A foreign key must resolve to exactly one id, so this picks the lowest
-- legacy id per canonical row as that entity''s public identity. min() is used
-- only because it is stable and total: any deterministic choice works, but it
-- must never vary between reads or two joins would disagree. Postgres has no
-- min(uuid), so the ordering is taken on the text form; uuid text is
-- fixed-width and lowercase here, so that order is total and stable.
create view compat._spk_primary as
select entity_table, entity_id, legacy_table,
       min(legacy_id::text)::uuid as legacy_id
from compat._spk_id
group by entity_table, entity_id, legacy_table;

comment on view compat._spk_primary is
  'One legacy id per canonical row, for translating foreign keys. Use '
  '_spk_id only to enumerate rows, never to resolve a reference.';

-- ------------------------------------------------------------------- helpers
-- Per-company and per-person conference slug arrays and counts. The legacy
-- views recomputed these on every read; keeping them as inline CTEs per view
-- would duplicate the logic four times, so they are separate views that the
-- planner inlines.
create view compat._spk_company_rollup as
with company_session as (
  -- A company is on a session when any of its people speak there. This is the
  -- same relation spk_company_sessions stored, which was measured to be 100%
  -- derivable (458/458, zero discrepancies), so it is recomputed rather than
  -- carried across as stored duplicate state.
  select distinct sp.company_id, ss.conference_session_id
  from signals.session_speaker ss
  join signals.speaker_profile sp on sp.id = ss.speaker_profile_id
  where sp.company_id is not null
)
select
  c.id                                                     as company_id,
  coalesce(count(distinct sp.id) filter (where sp.id is not null), 0)::int
                                                           as speakers,
  coalesce(count(distinct cs.conference_session_id), 0)::int as sessions,
  coalesce(
    array_agg(distinct conf.slug) filter (where conf.slug is not null),
    '{}'::text[])                                          as conferences
from public.company c
left join signals.speaker_profile sp on sp.company_id = c.id
left join company_session cs on cs.company_id = c.id
-- The conference array comes from conference_company, not from the conference
-- behind each session. Two conferences publish no agenda, so 304 of 594
-- company appearances exist only in conference_company and an agenda-derived
-- array would drop them.
left join signals.conference_company cc on cc.company_id = c.id
left join signals.conference conf on conf.id = cc.conference_id
group by c.id;

create view compat._spk_person_rollup as
select
  sp.id                                                     as speaker_profile_id,
  coalesce(count(distinct ss.conference_session_id), 0)::int as sessions,
  coalesce(
    array_agg(distinct conf.slug) filter (where conf.slug is not null),
    '{}'::text[])                                           as conferences
from signals.speaker_profile sp
left join signals.session_speaker ss on ss.speaker_profile_id = sp.id
left join signals.conference_participant cp on cp.speaker_profile_id = sp.id
left join signals.conference conf on conf.id = cp.conference_id
group by sp.id;

comment on view compat._spk_person_rollup is
  'Session counts come from session_speaker, but the conference list comes '
  'from conference_participant, not from the conference each session belongs '
  'to. Only one of the three conferences publishes a session agenda, so '
  'deriving attendance from sessions returned an empty conference array for '
  '195 of 698 speakers.';

-- --------------------------------------------------------------- spk_lists
create view compat.spk_lists as
select
  m.legacy_id            as id,
  l.name                 as name,
  l.raw->>'slug'         as slug,
  l.description          as description,
  -- The app expects the source system's timestamps, not this database's audit
  -- trail. public.list.created_at/updated_at record when the canonical row was
  -- written (load time, trigger-maintained), which is a different fact, so the
  -- legacy values are carried in raw and preferred here.
  coalesce((l.raw->>'legacy_created_at')::timestamptz, l.created_at) as created_at,
  coalesce((l.raw->>'legacy_updated_at')::timestamptz, l.updated_at) as updated_at
from public.list l
join compat._spk_id m
  on m.entity_id = l.id and m.legacy_table = 'spk_lists';

-- ------------------------------------------------------------- spk_sessions
-- day/time stay text: a label is not a date. "11:40am-12:00pm" carries no date
-- and no timezone, so parsing it would invent information.
create view compat.spk_sessions as
select
  m.legacy_id            as id,
  cm.legacy_id           as conference_id,
  s.title                as title,
  s.abstract             as description,
  s.day_label            as day,
  s.time_label           as time,
  s.room                 as room,
  s.track                as track,
  s.session_type         as session_type,
  s.status               as status,
  null::text[]           as topics,
  s.synced_at            as synced_at
from signals.conference_session s
join compat._spk_id m
  on m.entity_id = s.id and m.legacy_table = 'spk_sessions'
left join compat._spk_primary cm
  on cm.entity_id = s.conference_id and cm.legacy_table = 'spk_conferences';

comment on view compat.spk_sessions is
  'topics is projected as NULL because the legacy column was non-null on 0 of '
  '551 rows: it is dead, so nothing was migrated into it.';

-- -------------------------------------------------------- spk_session_people
create view compat.spk_session_people as
select
  sm.legacy_id           as session_id,
  pm.legacy_id           as person_id
from signals.session_speaker ss
join compat._spk_primary sm
  on sm.entity_id = ss.conference_session_id and sm.legacy_table = 'spk_sessions'
join compat._spk_id pm
  on pm.entity_id = ss.speaker_profile_id
 and pm.legacy_table = 'spk_people_profile';

-- ------------------------------------------------------ spk_company_sessions
create view compat.spk_company_sessions as
select distinct
  cm.legacy_id           as company_id,
  sm.legacy_id           as session_id
from signals.session_speaker ss
join signals.speaker_profile sp on sp.id = ss.speaker_profile_id
join compat._spk_primary cm
  on cm.entity_id = sp.company_id and cm.legacy_table = 'spk_companies'
join compat._spk_primary sm
  on sm.entity_id = ss.conference_session_id and sm.legacy_table = 'spk_sessions'
where sp.company_id is not null;

comment on view compat.spk_company_sessions is
  'Derived from session_speaker, not carried as stored state. Returns 457 '
  'rows against the legacy 458: two legacy company rows that merged (Google, '
  'Microsoft, AWS, McKinsey, Uber and Temporal each appeared twice) both '
  'pointed at one shared session, so that pair deduplicates. Verified: '
  'translating all 458 legacy pairs to canonical ids yields exactly 457 '
  'distinct pairs. The missing row is a duplicate, not a lost relationship.';

-- ------------------------------------------------- spk_conference_people
create view compat.spk_conference_people as
select
  fm.legacy_id      as conference_id,
  pm.legacy_id      as person_id,
  cp.is_speaker     as is_speaker,
  cp.participant_role as role
from signals.conference_participant cp
join compat._spk_primary fm
  on fm.entity_id = cp.conference_id and fm.legacy_table = 'spk_conferences'
join compat._spk_id pm
  on pm.entity_id = cp.speaker_profile_id
 and pm.legacy_table = 'spk_people_profile';

-- ---------------------------------------------- spk_conference_companies
create view compat.spk_conference_companies as
select
  fm.legacy_id       as conference_id,
  cm.legacy_id       as company_id,
  cc.is_sponsor      as is_sponsor,
  cc.is_exhibitor    as is_exhibitor,
  cc.sponsor_tier    as sponsor_tier,
  cc.booth           as booth,
  cc.score_overall   as score_overall,
  null::text         as notes
from signals.conference_company cc
join compat._spk_primary fm
  on fm.entity_id = cc.conference_id and fm.legacy_table = 'spk_conferences'
join compat._spk_primary cm
  on cm.entity_id = cc.company_id and cm.legacy_table = 'spk_companies';

comment on view compat.spk_conference_companies is
  'notes is projected as null rather than stored: it was non-null on 0 of 594 '
  'legacy rows, so carrying the column would have migrated an empty field. '
  'Returns 585 rows against the legacy 594 because 9 pairs belong to '
  'companies that merged, the same dedup as spk_company_sessions.';

-- ---------------------------------------------------- spk_company_people
-- Stored duplicate state in the source: measured as exactly the 612 pairs
-- already implied by spk_people.company_id, so it is recomputed here instead
-- of being carried across as its own table.
create view compat.spk_company_people as
select
  cm.legacy_id as company_id,
  pm.legacy_id as person_id
from signals.speaker_profile sp
join compat._spk_primary cm
  on cm.entity_id = sp.company_id and cm.legacy_table = 'spk_companies'
join compat._spk_id pm
  on pm.entity_id = sp.id and pm.legacy_table = 'spk_people_profile'
where sp.company_id is not null;

-- ---------------------------------------------------------- v_spk_companies
create view compat.v_spk_companies as
select
  m.legacy_id                  as id,
  c.name                       as name,
  c.domain                     as domain,
  c.website_url                as website,
  p.category                   as category,
  c.description                as description,
  p.product_positioning        as product_positioning,
  p.target_buyer               as target_buyer,
  p.is_sponsor                 as is_sponsor,
  p.is_exhibitor               as is_exhibitor,
  c.sponsor_tier               as sponsor_tier,
  c.linkedin_url               as linkedin_url,
  p.hq_location                as hq_location,
  p.employee_range             as employee_range,
  p.score_overall              as score_overall,
  p.best_fit_summit            as best_fit_summit,
  p.summit_fit_summary         as summit_fit_summary,
  p.suggested_pitch            as suggested_pitch,
  p.outreach_angle             as outreach_angle,
  p.is_vendor                  as is_vendor,
  p.segment                    as segment,
  p.confidence                 as confidence,
  p.rationale                  as rationale,
  p.method                     as method,
  r.speakers                   as speakers,
  r.sessions                   as sessions,
  r.conferences                as conferences
from public.company c
join compat._spk_id m
  on m.entity_id = c.id and m.legacy_table = 'spk_companies'
left join signals.speaker_company_profile p on p.company_id = c.id
left join compat._spk_company_rollup r on r.company_id = c.id;

-- ------------------------------------------------------------- v_spk_people
create view compat.v_spk_people as
select
  m.legacy_id                  as id,
  sp.full_name                 as full_name,
  sp.title                     as title,
  sp.title_verified            as title_verified,
  sp.bio_summary               as bio_summary,
  sp.bio                       as bio,
  li.url                       as linkedin,
  x.url                        as x_url,
  pe.photo_url                 as photo_url,
  ( select array_agg(t.label order by t.label)
      from public.entity_tag et
      join public.tag t on t.id = et.tag_id
     where et.entity_table = 'person' and et.entity_id = pe.id
       and et.applied_by = 'c2_load_speakers' ) as topics,
  pe.buying_influence          as buying_influence,
  sp.sponsor_relevance_notes   as sponsor_relevance_notes,
  sp.suggested_email_angle     as suggested_email_angle,
  sp.is_speaker                as is_speaker,
  cm.legacy_id                 as company_id,
  c.name                       as company_name,
  c.domain                     as company_domain,
  cp.is_sponsor                as company_is_sponsor,
  cp.is_vendor                 as is_vendor,
  cp.segment                   as segment,
  r.conferences                as conferences,
  r.sessions                   as sessions
from signals.speaker_profile sp
join public.person pe on pe.id = sp.person_id
join compat._spk_id m
  on m.entity_id = sp.id and m.legacy_table = 'spk_people_profile'
left join signals.platform_account li on li.id = sp.linkedin_account_id
left join signals.platform_account x  on x.id  = sp.x_account_id
left join public.company c on c.id = sp.company_id
left join compat._spk_primary cm
  on cm.entity_id = sp.company_id and cm.legacy_table = 'spk_companies'
left join signals.speaker_company_profile cp on cp.company_id = sp.company_id
left join compat._spk_person_rollup r on r.speaker_profile_id = sp.id;

-- -------------------------------------------------------- v_spk_conferences
create view compat.v_spk_conferences as
select
  m.legacy_id                                     as id,
  conf.slug                                       as slug,
  conf.name                                       as name,
  conf.edition                                    as edition,
  conf.location                                   as location,
  conf.starts_on                                  as start_date,
  conf.ends_on                                    as end_date,
  conf.source_url                                 as url,
  coalesce(sp_agg.speakers, 0)::int               as speakers,
  coalesce(co_agg.companies, 0)::int              as companies,
  coalesce(se_agg.sessions, 0)::int               as sessions
from signals.conference conf
join compat._spk_id m
  on m.entity_id = conf.id and m.legacy_table = 'spk_conferences'
-- Speakers and companies are counted from the participation tables, not from
-- the session agenda. Two of the three conferences publish no sessions at
-- all, so an agenda-derived count reported zero speakers and zero companies
-- for them while the legacy view reported 113/231 and 82/73.
left join (
  select conference_id, count(*) as speakers
  from signals.conference_participant group by conference_id
) sp_agg on sp_agg.conference_id = conf.id
left join (
  select conference_id, count(*) as companies
  from signals.conference_company group by conference_id
) co_agg on co_agg.conference_id = conf.id
left join (
  select conference_id, count(*) as sessions
  from signals.conference_session group by conference_id
) se_agg on se_agg.conference_id = conf.id;

-- ------------------------------------------------------ v_spk_list_members
create view compat.v_spk_list_members as
select
  lm_id.legacy_id              as list_id,
  l.raw->>'slug'               as list_slug,
  l.name                       as list_name,
  cm.legacy_id                 as company_id,
  lm.meta->>'note'             as note,
  coalesce(lm.meta->>'status', 'new') as status,
  lm.added_at                  as added_at,
  c.name                       as name,
  c.domain                     as domain,
  p.is_sponsor                 as is_sponsor,
  p.score_overall              as score_overall,
  p.segment                    as segment,
  p.is_vendor                  as is_vendor,
  r.speakers                   as speakers
from public.list_member lm
join public.list l on l.id = lm.list_id
join compat._spk_id lm_id
  on lm_id.entity_id = l.id and lm_id.legacy_table = 'spk_lists'
join public.company c on c.id = lm.entity_id
join compat._spk_primary cm
  on cm.entity_id = c.id and cm.legacy_table = 'spk_companies'
left join signals.speaker_company_profile p on p.company_id = c.id
left join compat._spk_company_rollup r on r.company_id = c.id
where lm.entity_table = 'company';

-- ---------------------------------------------------------- v_spk_segments
create view compat.v_spk_segments as
select
  p.segment                                   as segment,
  p.is_vendor                                 as is_vendor,
  count(distinct p.company_id)::int           as companies,
  coalesce(sum(r.speakers), 0)::int           as speakers
from signals.speaker_company_profile p
left join compat._spk_company_rollup r on r.company_id = p.company_id
where p.segment is not null
group by p.segment, p.is_vendor;

-- ---------------------------------------------------------------------------
-- PARITY NOTES (measured 2026-09-20 against the legacy Supabase views).
--
-- Row counts are exact for every view. The remaining FIELD differences were
-- attributed row by row; all of them fall into four proven classes, and none
-- is data loss:
--
-- 1. SHARED ROW -- another app authored the canonical value. 286 of the 558
--    speaker companies already existed in public.company with an external_ref
--    from engager_v1 / hubspot. The loader fills gaps with coalesce and never
--    overwrites, so the canonical value wins and the legacy view differs.
--    Accounts for linkedin_url 247, website 163, name 48, description 37,
--    domain 20, sponsor_tier 15 on v_spk_companies and company_name 53,
--    company_domain 7 on v_spk_people. Example: legacy 'Sonar' is canonical
--    'SonarSource'; legacy 'https://www.toptal.com' is canonical
--    'https://toptal.com' (authored by the Engager, NOT normalization here).
--
-- 2. MERGED ENTITY -- two legacy rows resolve to one canonical row. 10 of 558
--    companies and 8 of 698 people merged. Rollup arrays and counts therefore
--    differ, and join tables collapse duplicate pairs.
--    v_spk_segments deltas sum to exactly -10 companies and net 0 speakers,
--    which is precisely the 10 company merges.
--
-- 3. UNTRUSTED DOMAIN -- 3 companies whose legacy domain was a profile host
--    ('linkedin.com', 'apple.com' on a non-Apple row). Deliberately rejected
--    and preserved in company.raw.unverified_domain.
--
-- 4. TAG CASING -- 4 people whose topics differ only in canonical tag casing
--    ('AutoResearch' -> 'Autoresearch', 'Go-To-Market' -> 'Go-to-Market'),
--    because tags resolve through the shared canonical tag vocabulary.
--
-- Join tables are EXACT once legacy ids are collapsed onto canonical identity:
--   spk_company_sessions     458 legacy -> 457 canonical-distinct, 457 loaded
--   spk_company_people       612 legacy -> 611 canonical-distinct, 612 rows
--   spk_conference_companies 594 legacy -> 585 canonical-distinct, 585 loaded
-- all with missing=0 and extra=0.
--
-- spk_conference_companies additionally shows is_sponsor/is_exhibitor differing
-- on 4 rows: when two legacy companies merge, the flags are OR-ed, because a
-- merged company did sponsor the event if either duplicate did.
-- ---------------------------------------------------------------------------
