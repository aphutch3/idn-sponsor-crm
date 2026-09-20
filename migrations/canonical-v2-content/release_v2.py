#!/usr/bin/env python3
"""Guarded atomic runner for the canonical-v2-content release.

Sibling of migrations/canonical-v1/release.py. That runner asserts the meta
schema does NOT yet exist, so it cannot be reused once canonical-v1 is deployed.
This runner asserts the inverse: canonical-v1 must already be in place.

The entire release is one transaction. Any failure rolls back everything.

Usage:
  CANONICAL_MIGRATION_DSN='postgresql://...' python3 release_v2.py \
      --database canonical \
      --git-commit <40-hex> \
      --expected-public-tables 74
"""
import argparse
import hashlib
import os
import re
import sys

import psycopg2

RELEASE_NAME = "canonical-v2-content"
ADVISORY_KEY = (7092026, 601)

FILES = [
    "60_content_additive.sql",
    "61_content_indexes.sql",
    "62_content_triggers.sql",
    "63_signals_private.sql",
    "64_content_contract.sql",
]

# Objects this release creates. Their absence is the precondition; their
# presence afterwards is the postcondition.
NEW_TABLES = [
    ("public", "content_publication"),
    ("public", "content_source"),
    ("public", "content_edition"),
    ("public", "content_item"),
    ("public", "content_newsletter_item"),
    ("public", "content_entity"),
    ("public", "content_metric"),
    ("public", "content_enrichment"),
    ("signals", "person_profile"),
    ("signals", "reader_cache"),
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
            cur.execute("set local statement_timeout = '120s'")
            cur.execute("select pg_advisory_xact_lock(%s, %s)", ADVISORY_KEY)

            cur.execute("select current_database()")
            db = cur.fetchone()[0]
            if db != args.database:
                raise SystemExit(f"ERROR: connected to {db!r}, expected {args.database!r}")

            # Precondition 1: canonical-v1 must be deployed.
            cur.execute("select to_regnamespace('meta') is not null")
            if not cur.fetchone()[0]:
                raise SystemExit("ERROR: meta schema absent; run the canonical-v1 release first")
            cur.execute("select count(*) from meta.schema_release where state = 'deployed'")
            if cur.fetchone()[0] < 1:
                raise SystemExit("ERROR: no deployed schema_release found")

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

            # Apply.
            for name, digest, sql in payloads:
                print(f"applying {name} ({digest[:12]}…)")
                cur.execute(sql)

            # Postcondition: every declared object now exists.
            for schema, table in NEW_TABLES:
                cur.execute("select to_regclass(%s) is not null", (f"{schema}.{table}",))
                if not cur.fetchone()[0]:
                    raise SystemExit(f"ERROR: {schema}.{table} missing after apply")

            # Postcondition: every new column is documented.
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
                raise SystemExit(f"ERROR: {undocumented} new column(s) lack a meta.column_annotation row")

            # Record the release.
            for name, digest, _ in payloads:
                cur.execute("""
                    insert into meta.migration_execution
                      (migration_name, sha256, executed_at, git_commit, database_name)
                    values (%s, %s, now(), %s, %s)
                    on conflict (migration_name) do nothing""",
                            (name, digest, args.git_commit, args.database))

            notes = ("Additive content-domain release. Adds the platform-agnostic content "
                     "spine, the Signals application schema, and their governance contract. "
                     "No existing table, column or row is altered.")
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
