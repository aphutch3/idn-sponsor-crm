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

---

## Step 1.5 — DB_TARGET flag (2026-09-09) ✅

Added `DB_TARGET` env var to `app/src/lib/supabase.ts`:
- `DB_TARGET=supabase` (default) — legacy Supabase client, prod behavior unchanged
- `DB_TARGET=neon` — routes `db()` and `dbWrite()` to a new Neon-backed shim at `app/src/lib/neon-db.ts`

The Neon shim is a PostgREST-shape query builder over `@neondatabase/serverless` HTTP mode. It implements the exact method surface the app uses today: 26 methods across `.from()`, filters, modifiers, mutations, and `.rpc()`. No public HTTP endpoint — the shim connects to Postgres via the DSN, same as our psycopg scripts.

**Why this approach (not Neon Data API):**
Tried Data API first. Provisioning it required either JWT auth (needs infrastructure we don't have yet) or exposing an unauthenticated anon-role endpoint over public HTTPS (rejected — canonical has real PII). The serverless-driver shim keeps auth via DSN, adds no public surface, and is framework-portable to TanStack.

**Environment variables:**
- `DB_TARGET=neon`
- `DATABASE_URL_CANONICAL` — the pooled canonical DSN
- `DATABASE_URL_CANONICAL_READ` (optional) — read-only DSN; falls back to write DSN

**Coverage tested:** 11/12 SQL parity patterns pass against canonical. The one "failure" was hitting a real canonical-vs-Supabase schema drift on `list.entity_types` (column doesn't exist on canonical). That's data-model work for Phase 1's later steps, not a shim bug.

**Prod pointer unchanged.** `.env.production` on Vercel still has no `DB_TARGET`, so it defaults to `supabase`. Step 1.6 will do a preview deploy with `DB_TARGET=neon`.

---

## Step 1.6 — Preview deploy on DB_TARGET=neon (2026-09-09) ✅

Deployed the Engager app to a Vercel preview with `DB_TARGET=neon` pointing at canonical. Preview env vars set: `DB_TARGET=neon`, `DATABASE_URL_CANONICAL` (pooled DSN), `DATABASE_URL_CANONICAL_READ` (same DSN), plus non-sensitive supabase/API vars copied from prod.

Preview URL: `https://idn-sponsor-cjfrbxdzd-aphutch3s-projects.vercel.app` (Vercel SSO protected).

Smoke test surfaced two schema-drift issues:

1. **Table naming.** 100 call sites in the app reference plural table names (`contacts`, `companies`, `lists`, `tags`, ...). Canonical uses singular (`contact`, `company`, `list`, `tag`) by design — the schema-as-art principle. Every plural query returned `{data: null, error: "relation does not exist"}`.

2. **Dropped columns.** Canonical `contact` deliberately does not have `key_contact` (moved to `entity_tag`) or `emails_opened/clicked/delivered/bounced/replied` (moved to `campaign_send` timestamps). The app filters and displays these fields directly.

Fix: **Migration 012 — plural aliases** (Step 1.6b, below).

Diagnostic route: `GET /api/admin/db-diag?secret=<CRON_SECRET>` runs a battery of probes and returns raw `{data, error, count}` per query, useful for future schema-parity verification.

---

## Step 1.6b — 012_plural_aliases.sql (2026-09-09) ✅

Added `migrations/012_plural_aliases.sql`: a compatibility layer of plural-name views over the singular canonical tables. Ships the app unchanged during Phase 1 cutover; drop these views when the app is later refactored to canonical singular naming (planned as a Phase 2 app refactor).

**Views created (16):**

- **Identity views (14, automatically updatable):** `activities`, `agent_runs`, `campaign_sends`, `companies`, `enrichments`, `linkedin_monitor_configs`, `linkedin_posts`, `linkedin_snapshots`, `linkedin_topic_tags`, `list_bindings`, `list_members`, `lists`, `social_mentions`, `tasks`, `tags`. Each is `create view <plural> as select * from <singular>`. INSERT/UPDATE/DELETE flow through to base tables.
- **Shape-restoring view (1):** `contacts` = `contact.*` plus computed:
  - `key_contact text[]` — array of uppercased tag slugs from `entity_tag` where `entity_table='contact'`
  - `emails_opened / emails_clicked / emails_delivered / emails_bounced int` — computed via subqueries on `campaign_send` timestamps (`opened_at`, `clicked_at`, `delivered_at`, `bounced_at`)
  - `emails_replied int` — constant `0` until reply tracking is added
  - Added columns are read-only; underlying `contact` columns remain updatable through the view.

**Not covered (missing from canonical, will show empty states in the app):** `linkedin_signals`, `list_filters`, `list_versions`, `segments`, `social_refresh_log`, `v_key_contacts`, `v_taxonomy`. These are legacy features not yet ported and are non-critical for cutover.

**Test procedure:**

1. Created branch `test-012-plural-aliases` (br-broad-brook-a5nbs29a).
2. Applied migration; verified all 16 views have exact read parity with base tables.
3. Verified identity view mutability by full insert/update/delete round-trip on `tags` view.
4. Verified `contacts` view exposes `key_contact` correctly: 3463 contacts have 1 tag, 236 have 2 tags. Speaker filter (`key_contact && ARRAY['SPEAKER-EVANGCONF']`) returns 236 rows — matches entity_tag data.
5. Re-ran the app's Neon-DB shim diag script against the branch: 11/11 plural probes now succeed.

**Promotion:** applied to canonical main via direct psycopg (2026-09-09). Branch deleted post-promotion.

**Rollback:** `drop view public.<name>;` for each of the 16 views. See migration file inline comments — each view has an idempotent `create or replace view` guard (except `contacts`, which uses `drop view if exists` + `create view` because its column shape differs from a naive `select *`).

**Status:** ✅ 012 applied to canonical main. App can now be preview-deployed on `DB_TARGET=neon` and every page that queries the covered tables will resolve correctly.

**Next: Step 1.6c** — re-deploy preview and re-run the smoke test to confirm pages render with real data.
