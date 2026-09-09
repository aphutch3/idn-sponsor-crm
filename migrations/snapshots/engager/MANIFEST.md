# Engager Snapshot — 2026-09-09

Source: Supabase project `wpgfanjopuupjcgrdbmb` (region us-east-1)
Extraction: `select jsonb_agg(to_jsonb(t)) as rows, count(*) as n from <table> t;` via Supabase MCP `execute_sql`.
Format: one JSON object per line (JSONL). Row order not preserved (no ORDER BY needed for staging load).

## Tables with rows (13)

| Table | Rows | Bytes |
|---|--:|--:|
| contacts | 3,699 | 9,537,559 |
| companies | 2,087 | 4,267,565 |
| linkedin_topic_tags | 951 | 334,174 |
| social_mentions | 85 | 68,251 |
| linkedin_posts | 30 | 94,502 |
| linkedin_snapshots | 15 | 15,739 |
| social_refresh_log | 9 | 1,266 |
| linkedin_monitor_configs | 3 | 1,944 |
| lists | 3 | 1,771 |
| list_bindings | 3 | 975 |
| list_members | 3 | 831 |
| activities | 2 | 895 |
| tasks | 1 | 342 |
| **Total** | **6,890** | **~14.3 MB** |

## Empty tables (skipped — verified 0 rows during pre-snapshot inventory)

- segments
- agent_runs
- enrichments
- campaign_sends
- campaigns
- list_filters
- list_versions
- linkedin_signals

Total tables in Engager DB: 21. Empty ones are preserved in the schema doc (`docs/canonical-schema-v1.md`) but not staged since Migration 010 has no rows to transform.

## Live-tail note

The cron `[42238cc4]` refreshes `social_mentions` every 6 hours. Any rows added between snapshot (2026-09-09 10:02 UTC) and cutover (Step 1.7) will be lost unless we re-snapshot `social_mentions` at cutover time. Plan: re-run the `social_mentions`-only extract as the first step of Migration 010's staging load in the cutover window.

## Next: Migration 010

`stg_engager.*` staging schema on Neon canonical main, loaded via `COPY ... FROM STDIN` from these JSONL files (transformed to CSV via jq), then `INSERT INTO canonical.*` with column mapping + FK resolution. Full plan in migrations/010_engager_ingest.sql when authored.
