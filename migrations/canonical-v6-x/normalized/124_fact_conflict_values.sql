-- 124_fact_conflict_values.sql
--
-- fact_conflict recorded only hashes of the two competing values. A hash tells
-- you THAT two sources disagreed and nothing about WHAT they said, so the table
-- could be counted but never acted on -- and a conflict nobody can adjudicate is
-- not a record, it is a tombstone. All 74 existing rows are in that state.
--
-- This matters because the winner is decided by load order, not by merit. The
-- CRM loads before the speakers app, so the CRM's value always wins, and the
-- CRM's value is sometimes plainly worse: the canonical row for Exa, the AI
-- search company, carries a LinkedIn URL for a hotel guest-engagement product.
-- Without the losing value stored, there is nothing to review that against.
--
-- Values are stored as text and capped: these are URLs, names and descriptions,
-- and a conflict record exists to be read by a person.

begin;

alter table meta.fact_conflict
  add column existing_value text,
  add column proposed_value text,
  -- Which source proposed the losing value. Without it a reviewer cannot tell
  -- whether the loser came from a system worth trusting over the winner.
  add column proposed_by text,
  add column observed_at timestamptz not null default now();

comment on column meta.fact_conflict.existing_value is
  'The value that was kept. Stored in full: the hash alongside it proves nothing a reviewer can use.';
comment on column meta.fact_conflict.proposed_value is
  'The value that was discarded, kept so the decision can be revisited.';
comment on column meta.fact_conflict.proposed_by is
  'Source system that proposed the discarded value.';

-- The existing unique key leads with source_record_id, which is nullable, and
-- in a unique index NULL never equals NULL -- so a conflict recorded without a
-- source_record row has no uniqueness at all and every re-run of a loader would
-- append a fresh copy. A conflict is a standing fact about two sources
-- disagreeing, not an event, so it must collapse to one row per
-- (target, field, proposing source). coalesce keeps that true when either
-- nullable part is absent.
-- source_record_id was NOT NULL, which required every conflict to originate in
-- a batch-ingested source_record. A conflict is a fact about two values
-- disagreeing, and a migration loader that reads an app database directly
-- produces no such record -- so the constraint did not describe the data, it
-- just blocked the paths that had not been written yet. Still a foreign key,
-- so the precise lineage is kept whenever it exists; proposed_by names the
-- source when it does not.
alter table meta.fact_conflict alter column source_record_id drop not null;

create unique index if not exists fact_conflict_uq
  on meta.fact_conflict (target_relation, target_id, target_field,
                         coalesce(proposed_by, ''));

create index if not exists fact_conflict_target_ix
  on meta.fact_conflict (target_relation, target_field);
create index if not exists fact_conflict_open_ix
  on meta.fact_conflict (resolution) where resolution = 'review_required';

commit;
