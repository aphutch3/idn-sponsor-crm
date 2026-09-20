-- 95_conference_session_sync.sql
--
-- conference_session carried no record of when a session row was last
-- refreshed from its source. The legacy speaker CRM populated synced_at on
-- all 551 session rows, and it is the only signal available for deciding
-- whether a scraped agenda is stale, so it is migrated rather than dropped.
--
-- This is deliberately NOT named updated_at: nothing writes it on local edit.
-- It means "last reconciled with the published agenda", which is a different
-- claim from "last modified", and collapsing the two would make a stale row
-- look fresh the moment anyone touched it.

alter table signals.conference_session
  add column if not exists synced_at timestamptz;

create index if not exists conference_session_synced_idx
  on signals.conference_session (synced_at desc nulls last);

insert into meta.column_annotation
  (schema_name, table_name, column_name, meaning, authority, null_meaning,
   unit, pii_class, is_derived)
values
  ('signals', 'conference_session', 'synced_at',
   'When this session was last reconciled with the published conference '
   'agenda. Not a local-edit timestamp.',
   'source', 'never reconciled with a published agenda', null, 'none', false)
on conflict (schema_name, table_name, column_name) do update
  set meaning      = excluded.meaning,
      authority    = excluded.authority,
      null_meaning = excluded.null_meaning,
      is_derived   = excluded.is_derived;
