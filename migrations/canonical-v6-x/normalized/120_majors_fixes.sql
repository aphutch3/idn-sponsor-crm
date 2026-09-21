-- 120_majors_fixes.sql
--
-- Two corrections to the majors model, plus the presentation columns the
-- original design dropped.
--
-- 1. content_source_id is REPLACED by a junction table. A major publication
--    covers MANY newsletter editions -- TLDR has eleven, The Information two --
--    so a single nullable fk could only ever hold one of them. Legacy stored
--    the set as a text[] of newsletter ids, which is the same many-to-many
--    relationship packed into an array where it cannot be joined, constrained,
--    or indexed. The junction table is the normalized form of that array and is
--    the reason this migration exists rather than just widening a column.
--
-- 2. The columns the dashboard actually renders -- publisher, tagline, website,
--    accent, notes -- had nowhere to live, so the Majors pages would have come
--    back blank even once the rows loaded. url_pattern and selector are how a
--    major decides which content belongs to it, which is behaviour, not
--    decoration.
--
-- major_analysis.source_count is added because it is evidence: it records how
-- many articles an analysis was generated from, so a stale analysis built on
-- eight articles is distinguishable from a current one built on two hundred.

begin;

alter table signals.major_publication
  add column publisher   text,
  add column tagline     text,
  add column website_url text,
  add column accent      text,
  add column notes       text,
  -- How this major claims content. 'newsletters' means "whatever the junction
  -- table lists"; 'url' means "match article_url against url_pattern", which is
  -- how the X viewer collects posts that arrive through no newsletter at all.
  add column selector    text,
  add column url_pattern text;

alter table signals.major_publication
  add constraint major_publication_selector_ck
  check (selector is null or selector in ('newsletters', 'url'));

-- A url-selected major needs a pattern to match with, and a newsletter-selected
-- one must not carry a pattern that would silently do nothing.
alter table signals.major_publication
  add constraint major_publication_selector_pattern_ck
  check (
    (selector = 'url'         and url_pattern is not null) or
    (selector = 'newsletters' and url_pattern is null)     or
    selector is null
  );

create table if not exists signals.major_publication_source (
  major_publication_id uuid not null
    references signals.major_publication(id) on delete cascade,
  content_source_id    uuid not null
    references public.content_source(id) on delete cascade,
  primary key (major_publication_id, content_source_id)
);

comment on table signals.major_publication_source is
  'Which newsletter sources a major publication covers. Replaces legacy major_publications.newsletter_ids, a text[] that could not be joined or constrained.';

-- Moved to the junction table above. Dropped rather than left in place so there
-- is exactly one answer to "which sources does this major cover".
alter table signals.major_publication
  drop column content_source_id;

alter table signals.major_analysis
  add column source_count integer,
  add constraint major_analysis_source_count_ck
    check (source_count is null or source_count >= 0);

comment on column signals.major_analysis.source_count is
  'How many articles this analysis was generated from. Distinguishes an analysis built on a thin crop from one built on a full archive.';

commit;
