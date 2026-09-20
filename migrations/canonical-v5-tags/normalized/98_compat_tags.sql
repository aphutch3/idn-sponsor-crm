-- ---------------------------------------------------------------------------
-- 98_compat_tags.sql
--
-- Legacy shapes for the news dashboard tag pages, served from signals.tag*.
--
-- The one hard requirement running through this file: legacy tag ids are
-- INTEGERS and the application treats them as integers. It builds Map<number,
-- ...> keyed on canonical_id, compares ids with ===, and routes /api/tags/:id
-- on the integer. Canonical ids are uuids. So every view here translates back
-- to the legacy integer, and the translation must be total -- a tag that loses
-- its integer would vanish from the page rather than fail loudly.
--
-- Legacy tables reproduced:
--   tag_canonical    (9 cols)  11,036 rows
--   tag_alias        (6 cols)  12,375 rows
--   tag_stats_daily  (7 cols)  28,123 rows
--   tag_cooccurrence (4 cols)  65,326 rows
-- ---------------------------------------------------------------------------

drop view if exists compat.tag_cooccurrence cascade;
drop view if exists compat.tag_stats_daily cascade;
drop view if exists compat.tag_alias cascade;
drop view if exists compat.tag_canonical cascade;
drop view if exists compat._tag_id cascade;

-- --------------------------------------------------------------- id bridge
-- canonical uuid <-> legacy integer.
--
-- Unlike the speaker domain there is no merge here: tags were loaded into an
-- empty signals.tag, so the mapping is strictly 1:1 and needs no _primary
-- companion view to collapse duplicates. The unique index on external_id
-- enforces that; if a second legacy id ever attaches to one canonical tag the
-- joins below would fan out, so that invariant is asserted in the loader.
create view compat._tag_id as
select
  er.entity_id                                      as tag_id,
  split_part(er.external_id, ':', 2)::int           as legacy_id
from external_ref er
where er.source_system   = 'news_dashboard'
  and er.entity_table    = 'tag'
  and er.source_record_type = 'tag_canonical';

comment on view compat._tag_id is
  'canonical tag uuid <-> legacy integer id. 1:1 by construction.';

-- ------------------------------------------------------------ tag_canonical
create view compat.tag_canonical as
select
  i.legacy_id                                       as id,
  t.slug,
  t.display_name,
  t.description,
  p.legacy_id                                       as parent_id,
  t.color,
  t.is_curated,
  t.created_at,
  t.updated_at
from signals.tag t
join compat._tag_id i on i.tag_id = t.id
-- LEFT: a parent outside the news dashboard's own tag set has no legacy id.
-- That must surface as a null parent, not drop the child row.
left join compat._tag_id p on p.tag_id = t.parent_id;

comment on view compat.tag_canonical is
  'Legacy news_dashboard.tag_canonical. canonical_tag_id is deliberately not '
  'projected: it links a signals tag to the shared public.tag taxonomy, which '
  'is a cross-app merge the legacy table never had a column for.';

-- ---------------------------------------------------------------- tag_alias
create view compat.tag_alias as
select
  a.id,
  a.raw_alias                                       as raw_tag,
  i.legacy_id                                       as canonical_id,
  a.confidence,
  a.derivation                                      as source,
  a.created_at
from signals.tag_alias a
join compat._tag_id i on i.tag_id = a.tag_id;

comment on view compat.tag_alias is
  'Legacy news_dashboard.tag_alias. source maps to derivation (how the alias '
  'was produced), NOT source_system (which application asserted it) -- see '
  '97_tag_alias_derivation.sql.';

-- ---------------------------------------------------------- tag_stats_daily
create view compat.tag_stats_daily as
select
  i.legacy_id                                       as canonical_id,
  s.day,
  s.article_count,
  s.avg_importance,
  s.sentiment_pos,
  s.sentiment_neu,
  s.sentiment_neg
from signals.tag_daily_stat s
join compat._tag_id i on i.tag_id = s.tag_id;

-- --------------------------------------------------------- tag_cooccurrence
-- signals.tag_cooccurrence stores each unordered pair once, normalised so that
-- tag_a < tag_b as UUIDS. The legacy table normalised the same pair on the
-- INTEGER ids. uuid5 does not preserve integer order, so roughly half the
-- pairs come back with their orientation flipped.
--
-- The application reads these pairs with
--   or=(canonical_a.eq.N,canonical_b.eq.N)
-- and then picks "the other one", so it tolerates either orientation. But
-- tolerating a difference is not the same as reproducing the table, and an
-- arbitrary orientation would make byte-level comparison against legacy fail
-- for no reason. least/greatest restores the legacy integer orientation
-- exactly, and is total: every pair has a smaller and a larger integer.
create view compat.tag_cooccurrence as
select
  least(a.legacy_id, b.legacy_id)                   as canonical_a,
  greatest(a.legacy_id, b.legacy_id)                as canonical_b,
  c.cooccurrences,
  c.last_seen_at
from signals.tag_cooccurrence c
join compat._tag_id a on a.tag_id = c.tag_a
join compat._tag_id b on b.tag_id = c.tag_b;

comment on view compat.tag_cooccurrence is
  'Legacy news_dashboard.tag_cooccurrence. Pair orientation is restored to the '
  'legacy integer ordering; the canonical table orders on uuid, which is a '
  'different order for the same unordered pair.';

-- ---------------------------------------------------------------------------
-- KNOWN DIFFERENCE FROM LEGACY -- one row, deliberate, reviewable
--
-- compat.tag_alias returns 12,374 rows where legacy tag_alias holds 12,375.
-- The single missing row is the alias 'r&d'.
--
-- signals.tag_alias enforces that a normalized alias resolves to exactly one
-- tag, which is what makes the table usable as a resolver. Legacy held two
-- tags for one concept -- 'r-and-d' (4 articles) and 'rd' (1 article) -- whose
-- aliases 'r&d' and 'rd' both normalise to 'rd'. The canonical schema refuses
-- to represent that ambiguity.
--
-- Nothing became unreachable: tag 'r-and-d' still resolves through its other
-- alias, 'r-and-d'. The dropped alias is not discarded, it is recorded as an
-- open row in signals.tag_merge_suggestion for an editor to decide:
--
--     select f.slug, i.slug, m.reason
--     from signals.tag_merge_suggestion m
--     join signals.tag f on f.id = m.from_tag_id
--     join signals.tag i on i.id = m.into_tag_id
--     where m.status = 'open';
--
-- Resolving that suggestion merges the two tags and the count difference goes
-- away on its own. Until then this is the ONLY value difference between the
-- legacy and canonical /api/tags payloads, across all 11,036 tags.
--
-- See c3_load_tags.py::_resolve_alias_conflicts for how the surviving alias is
-- chosen, and 99_tag_alias_identity.sql for why the invariant is a constraint
-- trigger rather than a unique index.
-- ---------------------------------------------------------------------------
