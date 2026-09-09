# idn-canonical migrations

Canonical schema for the Engager + Events + AIE merge, hosted on Neon.

## Destination
- **Neon project:** `idn-canonical` (id `small-brook-36877803`)
- **Region:** `aws-us-east-2`, pg 17.11
- **Database:** `canonical`
- **Role:** `canonical_owner`
- **Main branch:** `br-shy-thunder-a5eqvnso`

## Phase 1 Step 1.2 — DDL complete (2026-09-09)

| # | File | Contents | Status |
|---|---|---|---|
| 001 | `001_extensions.sql` | vector, citext, pgcrypto, pg_trgm (+ pg_stat_statements added post-hoc) | ✅ Applied |
| 002 | `002_enums.sql` | 5 enums: event_kind, event_role, media_kind, media_status, activity_kind | ✅ Applied |
| 003 | `003_lineage.sql` | source_system (+ 5 seed rows), external_ref, source_reference | ✅ Applied |
| 004 | `004_core_domain.sql` | company, contact, person, contact_company (+ embeddings, generated cols, HNSW) | ✅ Applied |
| 005 | `005_events.sql` | event_series, event, event_track, session, session_speaker, sponsorship, event_attendance | ✅ Applied |
| 006 | `006_media.sql` | media_asset, transcript, session_resource | ✅ Applied |
| 007 | `007_sales.sql` | activity, task | ✅ Applied |
| 008 | `008_audiences_campaigns.sql` | list, list_member, campaign, campaign_send, outreach_event | ✅ Applied |
| 009 | `009_crm_monitoring.sql` | crm_status, crm_note, tag, entity_tag, enrichment, agent_run, ingestion_job, app_health_ping, all_jobs view | ✅ Applied |

**Final tally on main:** 5 extensions, 5 enums, 32 public tables, 3 views (2 pg_stat_statements + all_jobs), 13 triggers, 94 indexes, 39 FKs, 5 source_system seed rows.

## Numbering plan for later phases

| Range | Purpose |
|---|---|
| 001-009 | Phase 1 DDL (schema v2) — done |
| 010 | LinkedIn / social domain DDL (list_binding + 5 tables) |
| 011 | Phase 1 · Step 1.4 Engager Supabase ingest (data motion, uses stg_engager staging) |
| 012-019 | Reserved for Engager ingest fix-ups |
| 020-029 | Phase 2 Events Supabase ingest |
| 030-039 | Phase 3 AIE Supabase ingest |
| 040-049 | Post-ingest indexes (HNSW rebuild, trgm indexes on populated tables) |
| 050+   | Schema evolution (v3 features, new domains) |

## How migrations are applied on Neon

The Neon MCP connector uses a splitter that breaks on `;` **before** understanding `$$` dollar-quoted function/DO blocks. This means:

1. Table/index DDL that ends each statement with `;` and does NOT contain a `$$ ... $$` block → apply via `prepare_database_migration` on a temp branch → verify → `complete_database_migration` promotes atomically to main.
2. Trigger functions with plpgsql bodies (`$$ begin ...; return ...; end $$`) → CANNOT go through `prepare_database_migration`. Rewrite the body as a **single-quoted string** (`as 'begin ...; return ...; end'`) and apply directly to main via `run_sql` (which uses a raw connection).
3. Trigger attachments (`create trigger ...`) → single statement each, safe via `run_sql_transaction`.

**IMPORTANT quirk:** `complete_database_migration` only re-runs the SQL originally passed to `prepare_database_migration`. Any statements you add via `run_sql`/`run_sql_transaction` on the temp branch are DISCARDED on promote. Always put the entire DDL migration into one `prepare_database_migration` call.

## Scale-vs-speed decisions locked in Phase 1

**Kept (scale insurance):**
- All FK constraints
- All `updated_at` triggers (needed for CDC and Neon Twin logical replication later)
- `raw jsonb` on every imported table (lets us reshape without re-import)
- `external_ref` polymorphic lineage (Q6)
- `agent_run` + `ingestion_job` separate + `all_jobs` view (Q4)
- HNSW indexes on `company.embedding` and `person.embedding` created empty — will rebuild post-ingest with parameters sized to real row counts
- `pg_stat_statements` for query-level performance data from day one

**Deferred until data lands:**
- Trigram (`gin_trgm_ops`) indexes on `event.name`, `session.title`
- GIN full-text on `transcript.text`
- Any partitioning

**Explicit non-goals for prototyping-first phase:**
- No RLS (agent-driven, single-tenant Engager for now)
- No read replicas
- No materialized views

## Phase 1 · Step 1.4b — Engager ingest draft (2026-09-09)

**Decisions D1–D6 locked** (from prior turn — see conversation history):
- **D1** Company dedup by `lower(domain)`, first-seen wins, loser lineage recorded in `external_ref`
- **D2** Person shadow only when `contact.linkedin_url` is present (1:1 with contact via `person.contact_id`)
- **D3** Dual lineage on every company (engager_v1 + hubspot); `contact_company` expanded via `external_ref` lookup on `associated_company_ids`
- **D4** `contacts.lead_status` → `crm_status.stage`; other tag-like fields → `tag`/`entity_tag`; catalog auto-populated on-the-fly
- **D5** LinkedIn/social split into its own DDL migration (010); ingest is 011
- **D6** Cutover starts with a fresh social_mentions-only re-snapshot before flipping the cron target

**Files:**
- `010_linkedin_social.sql` — DDL for `list_binding` + 5 LinkedIn/social tables
- `011_engager_ingest.sql` — 15 transforms reading from `stg_engager.*`; ends by dropping `stg_engager`
- `../scripts/load_stg_engager.py` — loads all 13 Engager JSONL snapshots into `stg_engager.*` via COPY
- `../scripts/verify_engager_ingest.sql` — read-back verification (12 checks, all SELECT-only)

### Runbook — Phase 1 · Step 1.4c (branch test)

All steps run against a **Neon branch**, not `main`. This runbook is what will execute once explicit approval is given.

**Order-of-operations design.** 011 is transforms only — it reads from `stg_engager.*` which must exist and be populated first. Migration 010 (LinkedIn/social DDL) is pure DDL and applies on its own. The sequence:

```
# 0. Set env for the loader (branch DSN, not main)
export DATABASE_URL_CANONICAL="postgres://canonical_owner:...@ep-BRANCH.aws.neon.tech/canonical"

# 1. Create a Neon branch off main (via neon MCP) named 'engager-ingest-test'

# 2. Apply 010 (LinkedIn/social DDL) via prepare_database_migration on that branch

# 3. Create + populate staging BEFORE 011 (loader handles both):
python3 scripts/load_stg_engager.py
# This emits DDL for stg_engager schema + 13 tables, then COPYs the JSONL in.

# 4. Apply 011 (transforms) via prepare_database_migration on that branch.
#    011 references stg_engager.* which is now populated.

# 5. Verify
psql "$DATABASE_URL_CANONICAL" -f scripts/verify_engager_ingest.sql

# 6. Manual inspection: does the sample company at the bottom of verify_engager_ingest.sql
#    show contacts, tags, LinkedIn posts as expected? Any orphan counts > 0?

# 7. If everything checks out → ask user for approval to promote to main (Step 1.4d)
# 8. If anything is wrong → drop the branch, fix 011, repeat
```

### Runbook — Phase 1 · Step 1.4d (promote)

```
# Only after user approval, and same order as the branch test:
# 1. Apply 010 on main via prepare_database_migration + complete_database_migration
# 2. Run loader against main's DSN (creates + populates stg_engager on main)
#    export DATABASE_URL_CANONICAL="...main DSN..."
#    python3 scripts/load_stg_engager.py
# 3. Apply 011 on main via prepare_database_migration + complete_database_migration
# 4. Run verify_engager_ingest.sql against main
# 5. Do NOT drop stg_engager yet — keep it around for Step 1.7 cutover verification and 1.8
#    rollback rehearsal. Step 1.8 drops it.
```

### Loader usage

```
# Show the CREATE TABLE DDL that will run:
python3 scripts/load_stg_engager.py --print-ddl

# Create staging tables only (no data load):
python3 scripts/load_stg_engager.py --tables-only

# Full: create tables + load all 13 JSONL files:
python3 scripts/load_stg_engager.py

# Idempotent re-run (truncate + reload):
python3 scripts/load_stg_engager.py

# Nuclear reset:
python3 scripts/load_stg_engager.py --drop-first
```

Expected loader output (row counts):
```
  stg_engager.companies                    read= 2087  loaded= 2087
  stg_engager.contacts                     read= 3699  loaded= 3699
  stg_engager.activities                   read=    2  loaded=    2
  stg_engager.tasks                        read=    1  loaded=    1
  stg_engager.lists                        read=    3  loaded=    3
  stg_engager.list_members                 read=    3  loaded=    3
  stg_engager.list_bindings                read=    3  loaded=    3
  stg_engager.linkedin_topic_tags          read=  951  loaded=  951
  stg_engager.linkedin_monitor_configs     read=    3  loaded=    3
  stg_engager.linkedin_posts               read=   30  loaded=   30
  stg_engager.linkedin_snapshots           read=   15  loaded=   15
  stg_engager.social_mentions              read=   85  loaded=   85
  stg_engager.social_refresh_log           read=    9  loaded=    9
TOTAL: read=6890  loaded=6890
```

**Status:** ✅ 010 + 011 applied to canonical main (2026-09-09).
- Branch test (`br-frosty-sky-a51vc9xk`): applied, verified, deleted.
- Main: 010 promoted via `prepare_database_migration` + `complete_database_migration`. 011 applied via direct psycopg (data migration; identical to branch-test file).
- Row counts on main match branch test exactly: 2087 companies, 3699 contacts, 3491 persons, 3666 contact_company, 15073 external_ref, 15 tags, 4405 entity_tags, 951 linkedin_topic_tags, 30 linkedin_posts, 85 social_mentions, 9 ingestion_jobs.
- Zero orphan references. Zero domain uniqueness violations.
- `stg_engager` schema preserved on main for Step 1.7 cutover and 1.8 rollback rehearsal.

**Next: Step 1.5** — add `DB_TARGET` (supabase | neon) flag to the Engager Next.js app so it can be pointed at either backend.
