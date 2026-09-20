#!/usr/bin/env python3
"""Guarded atomic runner for the canonical-v3-signals release.

Sibling of migrations/canonical-v2-content/release_v2.py. That runner asserts
canonical-v1 is deployed and the content spine is absent, so it cannot be
reused. This runner asserts the inverse: canonical-v2-content must already be
deployed, and the 39 signals tables this release creates must not yet exist.

The entire release is one transaction. Any failure rolls back everything.

Usage:
  CANONICAL_MIGRATION_DSN='postgresql://...' python3 release_v3.py \
      --database canonical \
      --git-commit <40-hex> \
      --neon-branch-id <br-...> \
      --expected-public-tables 82 [--dry-run]
"""
import argparse
import hashlib
import os
import re
import sys

import psycopg2

RELEASE_NAME = "canonical-v3-signals"
REQUIRES_RELEASE = "canonical-v2-content"
ADVISORY_KEY = (7092026, 602)

FILES = [
    "70_platform_accounts.sql",
    "71_account_triggers.sql",
    "72_platform_content.sql",
    "73_signals_jobs.sql",
    "74_content_kind_guard.sql",
    "75_github_graph.sql",
    "76_signals_taxonomy.sql",
    "77_signals_curation.sql",
    "78_signals_contract.sql",
]

# Every table this release creates. Absence is the precondition; presence
# afterwards is the postcondition. All 39 live in the signals application
# schema -- this release adds nothing to public, by design.
NEW_TABLES = [
    ("signals", t) for t in [
        "platform_account", "x_account_detail", "github_account_detail",
        "youtube_channel_detail", "linkedin_account_detail", "account_metric",
        "content_x_post", "content_youtube_video", "content_github_repo",
        "content_linkedin_post", "job_request", "job_run", "job_metric_kind",
        "job_run_metric", "repo_contribution_week", "repo_contributor",
        "pull_request_merge", "tag", "tag_alias", "tag_daily_stat",
        "tag_cooccurrence", "tag_merge_suggestion", "x_list", "x_list_member",
        "x_bookmark", "content_cluster", "content_cluster_member",
        "signal_capture", "account_score", "linkedin_engagement_observation",
        "conference", "speaker_profile", "conference_session", "session_speaker",
        "speaker_list", "speaker_list_member", "major_publication",
        "major_analysis", "dropdown_option",
    ]
]

# Enum types the release introduces; a leftover type would break a re-run.
NEW_ENUMS = [
    ("signals", "job_kind"), ("signals", "job_status"),
    ("signals", "tag_merge_status"), ("signals", "speaker_archetype"),
]

TXN_RE = re.compile(r"(?im)^\s*(?:begin|commit);\s*$")


def strip_txn(sql: str) -> str:
    """Remove top-level BEGIN/COMMIT so the whole release runs in one transaction."""
    return TXN_RE.sub("", sql)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", required=True)
    ap.add_argument("--git-commit", required=True)
    ap.add_argument("--snapshot-id")
    ap.add_argument("--neon-branch-id", required=True)
    ap.add_argument("--state", default="deployed",
                    choices=["draft", "approved", "deployed"])
    ap.add_argument("--expected-public-tables", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true",
                    help="Apply inside the transaction, verify, then roll back.")
    args = ap.parse_args()

    if not re.fullmatch(r"[0-9a-f]{40}", args.git_commit):
        print("ERROR: --git-commit must be exactly 40 lowercase hex characters")
        return 2
    if args.snapshot_id and not args.snapshot_id.startswith("snap-"):
        print("ERROR: --snapshot-id must start with 'snap-'")
        return 2
    if not args.neon_branch_id.startswith("br-"):
        print("ERROR: --neon-branch-id must start with 'br-'")
        return 2

    dsn = os.environ.get("CANONICAL_MIGRATION_DSN")
    if not dsn:
        print("ERROR: CANONICAL_MIGRATION_DSN is not set")
        return 2

    here = os.path.dirname(os.path.abspath(__file__))
    payloads = []
    for name in FILES:
        path = os.path.join(here, "normalized", name)
        if not os.path.exists(path):
            print(f"ERROR: missing migration file {path}")
            return 2
        raw = open(path, "rb").read()
        payloads.append((name, hashlib.sha256(raw).hexdigest(),
                         strip_txn(raw.decode("utf-8"))))

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("set local lock_timeout = '5s'")
            cur.execute("set local statement_timeout = '300s'")
            cur.execute("select pg_advisory_xact_lock(%s, %s)", ADVISORY_KEY)

            cur.execute("select current_database()")
            db = cur.fetchone()[0]
            if db != args.database:
                raise SystemExit(f"ERROR: connected to {db!r}, expected {args.database!r}")

            # Precondition 1: the content spine this release builds on is deployed.
            cur.execute("select to_regnamespace('meta') is not null")
            if not cur.fetchone()[0]:
                raise SystemExit("ERROR: meta schema absent; run the canonical-v1 release first")
            cur.execute("""select count(*) from meta.schema_release
                           where version = %s and state = 'deployed'""",
                        (REQUIRES_RELEASE,))
            if not cur.fetchone()[0]:
                raise SystemExit(
                    f"ERROR: {REQUIRES_RELEASE} is not deployed. This release "
                    "extends the content spine and cannot run without it.")
            cur.execute("select to_regclass('public.content_item') is not null")
            if not cur.fetchone()[0]:
                raise SystemExit("ERROR: public.content_item absent; content spine incomplete")

            # Precondition 2: the baseline is the shape we rehearsed against.
            cur.execute("""select count(*) from information_schema.tables
                           where table_schema='public' and table_type='BASE TABLE'""")
            actual = cur.fetchone()[0]
            if actual != args.expected_public_tables:
                raise SystemExit(
                    f"ERROR: public has {actual} tables, expected "
                    f"{args.expected_public_tables}. Refusing to run against an "
                    "unexpected baseline.")

            # Precondition 3: this release has not already been applied.
            cur.execute("select count(*) from meta.schema_release where version = %s",
                        (RELEASE_NAME,))
            if cur.fetchone()[0]:
                raise SystemExit(f"ERROR: release {RELEASE_NAME} already recorded")
            for schema, table in NEW_TABLES:
                cur.execute("select to_regclass(%s) is not null", (f"{schema}.{table}",))
                if cur.fetchone()[0]:
                    raise SystemExit(f"ERROR: {schema}.{table} already exists; not an additive run")
            for schema, enum in NEW_ENUMS:
                cur.execute("""select count(*) from pg_type t join pg_namespace n
                               on n.oid = t.typnamespace
                               where n.nspname = %s and t.typname = %s""", (schema, enum))
                if cur.fetchone()[0]:
                    raise SystemExit(
                        f"ERROR: type {schema}.{enum} already exists; not an additive run")

            # Precondition 4: no file has been applied individually before.
            for name, digest, _ in payloads:
                cur.execute("""select sha256 from meta.migration_execution
                               where migration_name = %s""", (name,))
                row = cur.fetchone()
                if row:
                    raise SystemExit(
                        f"ERROR: {name} already recorded as applied (sha {row[0][:12]}…)")

            # Apply.
            for name, digest, sql in payloads:
                print(f"applying {name} ({digest[:12]}…)")
                cur.execute(sql)

            # Postcondition: every declared object now exists.
            for schema, table in NEW_TABLES:
                cur.execute("select to_regclass(%s) is not null", (f"{schema}.{table}",))
                if not cur.fetchone()[0]:
                    raise SystemExit(f"ERROR: {schema}.{table} missing after apply")

            # Postcondition: every new column is documented. Scoped exactly as
            # the v2 gate is -- the signals schema plus the public content
            # spine. Legacy public tables predate the canonical work and are
            # out of scope for this release.
            cur.execute("""
                select count(*) from information_schema.columns c
                where (c.table_schema='signals'
                       or (c.table_schema='public' and c.table_name like 'content%%'))
                  and not exists (select 1 from meta.column_annotation a
                        where a.schema_name=c.table_schema
                          and a.table_name=c.table_name
                          and a.column_name=c.column_name)""")
            undocumented = cur.fetchone()[0]
            if undocumented:
                raise SystemExit(
                    f"ERROR: {undocumented} new column(s) lack a meta.column_annotation row")

            # Postcondition: every new table is in the catalog. table_catalog is
            # a view over object_annotation, so an unannotated table is invisible
            # to any agent reading the catalog.
            cur.execute("""
                select count(*) from information_schema.tables t
                where t.table_schema='signals' and t.table_type='BASE TABLE'
                  and not exists (select 1 from meta.object_annotation o
                        where o.schema_name=t.table_schema
                          and o.object_name=t.table_name)""")
            uncatalogued = cur.fetchone()[0]
            if uncatalogued:
                raise SystemExit(
                    f"ERROR: {uncatalogued} signals table(s) lack a meta.object_annotation row")

            # Record the release.
            for name, digest, _ in payloads:
                cur.execute("""
                    insert into meta.migration_execution
                      (migration_name, sha256, executed_at, git_commit, database_name)
                    values (%s, %s, now(), %s, %s)
                    on conflict (migration_name) do nothing""",
                            (name, digest, args.git_commit, args.database))

            notes = (
                "Additive Signals-domain release. Adds the platform-account identity "
                "layer, per-platform content and account detail tables, the collapsed "
                "job queue that replaces thirteen duplicated per-domain tables, the "
                "GitHub contribution graph on a natural key, the working tag vocabulary "
                "with promotion to the governed taxonomy, the curation and speaker "
                "prospecting layer, and the governance contract for all of it. No "
                "existing table, column or row is altered.")
            if args.snapshot_id:
                notes += f" Snapshot {args.snapshot_id}."
            cur.execute("""
                insert into meta.schema_release
                  (version, state, approved_at, deployed_at, git_repository,
                   git_commit, neon_branch_id, notes)
                values (%s, %s,
                        case when %s in ('approved','deployed') then now() end,
                        case when %s = 'deployed' then now() end,
                        'aphutch3/idn-sponsor-crm', %s, %s, %s)""",
                        (RELEASE_NAME, args.state, args.state, args.state,
                         args.git_commit, args.neon_branch_id, notes))

        if args.dry_run:
            conn.rollback()
            print("DRY RUN: verified, rolled back.")
        else:
            conn.commit()
            print(f"{RELEASE_NAME} deployed.")
        return 0
    except BaseException as exc:
        conn.rollback()
        print(f"ROLLED BACK: {exc}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
