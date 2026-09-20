-- ---------------------------------------------------------------------------
-- 97_tag_alias_derivation.sql
--
-- signals.tag_alias records WHO asserted an alias (source_system) but not HOW
-- the alias was derived. The news dashboard carries that second fact: every one
-- of its 12,375 aliases is tagged 'auto-slug', meaning the alias was generated
-- by slugifying the raw tag rather than curated by a human.
--
-- These are genuinely different columns and collapsing them loses information
-- in both directions:
--
--   * Storing source_system = 'auto-slug' breaks the FK to source_system(code),
--     which is a registry of APPLICATIONS. 'auto-slug' is not an application.
--   * Storing only source_system = 'news_dashboard' and projecting the literal
--     'auto-slug' back out of the compat view would be a lie the moment a
--     curated alias arrives -- the view would relabel it as machine-derived.
--
-- The column is uniform today, which is exactly why it is cheap to normalise
-- now and expensive to retrofit later. Nullable rather than defaulted: an alias
-- whose derivation was never recorded must stay distinguishable from one known
-- to be automatic.
--
-- No CHECK constraint on the value. One observed value is not enough evidence
-- to close a vocabulary, the same judgement already applied to
-- signals.conference.status.
-- ---------------------------------------------------------------------------

alter table signals.tag_alias
  add column if not exists derivation text;

comment on column signals.tag_alias.derivation is
  'How the alias was produced (e.g. auto-slug for slugified raw tags), as '
  'opposed to source_system which records which application asserted it. '
  'NULL means the derivation was not recorded.';

-- NOTE: the tag_id index that stood here was dropped in 99 as a duplicate of
-- the pre-existing tag_alias_tag_ix. Left as a comment so the sequence reads
-- honestly rather than pretending the misstep never happened.
-- The alias->canonical resolution path: given a raw tag observed in the wild,
-- find the canonical tag. Normalised rather than raw because that is the form
-- a resolver has in hand.
create index if not exists tag_alias_normalized_idx
  on signals.tag_alias (normalized_alias);
