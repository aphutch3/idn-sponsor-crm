-- ---------------------------------------------------------------------------
-- 99_tag_alias_identity.sql
--
-- signals.tag_alias carried UNIQUE (normalized_alias) globally. That index is
-- trying to state something true and worth keeping:
--
--     a normalized alias must resolve to exactly one tag
--
-- which is the invariant that makes the alias table usable as a resolver at
-- all. Without it, an agent normalising a raw tag could get two answers and
-- would have no principled way to choose.
--
-- But as written it also forbids something legitimate: two different surface
-- spellings of the same alias. Measured against the 12,375 news dashboard
-- aliases:
--
--     distinct raw_alias ................ 12,375  (every surface form unique)
--     distinct normalized_alias ......... 11,043
--     colliding normalized groups .......  1,328
--       ... pointing at the SAME tag ....  1,328
--       ... pointing at DIFFERENT tags ..      0
--
-- So the data satisfies the invariant and violates the index. 'Tool Calling'
-- and 'tool-calling' are two real observed spellings that resolve to one tag;
-- collapsing them would throw away which forms were actually seen in the wild,
-- which is the entire point of an alias table.
--
-- This file therefore splits the two concerns the single index was conflating:
--
--   IDENTITY   one row per observed surface form  -> UNIQUE (raw_alias)
--   INVARIANT  one normalized form, one tag       -> constraint trigger
--
-- The invariant is a functional dependency (normalized_alias -> tag_id), not a
-- uniqueness property, and no single-column unique index can express it. A
-- constraint trigger is the narrowest mechanism that can: it rejects exactly
-- the disagreement case and permits agreeing duplicates.
-- ---------------------------------------------------------------------------

drop index if exists signals.tag_alias_normalized_uk;

-- One row per observed surface form.
create unique index if not exists tag_alias_raw_uk
  on signals.tag_alias (raw_alias);

-- Redundant with the pre-existing tag_alias_tag_ix on the same column. A
-- duplicate index is pure cost: it is maintained on every write and never
-- chosen over its twin.
drop index if exists signals.tag_alias_tag_id_idx;

-- --------------------------------------------------------- the invariant
create or replace function signals.tag_alias_resolves_once()
returns trigger
language plpgsql
as $$
declare
  other uuid;
begin
  -- Any OTHER row with the same normalized form must agree on the tag.
  -- LIMIT 1 because one counterexample is enough to reject.
  select a.tag_id into other
  from signals.tag_alias a
  where a.normalized_alias = new.normalized_alias
    and a.id <> new.id
    and a.tag_id <> new.tag_id
  limit 1;

  if other is not null then
    raise exception
      'alias % normalises to %, which already resolves to tag %; '
      'a normalized alias must resolve to exactly one tag',
      new.raw_alias, new.normalized_alias, other
      using errcode = 'integrity_constraint_violation';
  end if;

  return null;
end;
$$;

comment on function signals.tag_alias_resolves_once() is
  'Enforces the functional dependency normalized_alias -> tag_id, which a '
  'unique index cannot express without also forbidding two spellings of the '
  'same alias.';

drop trigger if exists tag_alias_resolves_once on signals.tag_alias;

-- AFTER and DEFERRABLE on purpose. A bulk load inserts in arbitrary order and
-- a row-by-row BEFORE check would reject a batch that is consistent once
-- complete. Deferring to commit tests the finished state, which is the state
-- the invariant is actually about.
create constraint trigger tag_alias_resolves_once
  after insert or update of normalized_alias, tag_id on signals.tag_alias
  deferrable initially deferred
  for each row
  execute function signals.tag_alias_resolves_once();
