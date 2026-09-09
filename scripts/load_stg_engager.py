#!/usr/bin/env python3
"""
Load Engager JSONL snapshots into stg_engager.* on Neon canonical.

Usage:
    export DATABASE_URL_CANONICAL="postgres://canonical_owner:...@ep-xxx.aws.neon.tech/canonical"
    python3 scripts/load_stg_engager.py                # default: creates schema + tables, then loads
    python3 scripts/load_stg_engager.py --print-ddl    # print the CREATE TABLE DDL and exit
    python3 scripts/load_stg_engager.py --tables-only  # only create tables (skip load)
    python3 scripts/load_stg_engager.py --load-only    # skip DDL, only load (tables must exist)
    python3 scripts/load_stg_engager.py --drop-first   # DROP SCHEMA stg_engager CASCADE first

Requires: psycopg[binary] >= 3.1
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# psycopg is only needed when we actually connect to Neon. --print-ddl works without it.
try:
    import psycopg
    from psycopg import sql
    _HAS_PSYCOPG = True
except ImportError:
    psycopg = None       # type: ignore[assignment]
    sql = None           # type: ignore[assignment]
    _HAS_PSYCOPG = False


SNAPSHOT_DIR = Path(__file__).parent.parent / "migrations" / "snapshots" / "engager"


@dataclass
class TableSpec:
    """One source table → one stg_engager.<name> table."""
    name: str
    columns: list[tuple[str, str]]   # (column_name, postgres_type)
    array_columns: set[str]           # columns that are Postgres arrays (need list unwrap)
    jsonb_columns: set[str]           # columns that are jsonb (need dict → json.dumps)

    def create_ddl(self) -> str:
        col_defs = ",\n  ".join(f"{name} {typ}" for name, typ in self.columns)
        return (
            f"create table if not exists stg_engager.{self.name} (\n  "
            f"{col_defs},\n  _ingested_at timestamptz not null default now()\n);"
        )

    def column_names(self) -> list[str]:
        return [c[0] for c in self.columns]


# ---------------------------------------------------------------------------
# Source table specs — column names + types match the Engager Supabase schema
# ---------------------------------------------------------------------------

SPECS: list[TableSpec] = [
    TableSpec(
        name="companies",
        columns=[
            ("id", "text"),                    # source uuid; kept as text to match external_ref.external_id
            ("name", "text"),
            ("domain", "text"),
            ("website_url", "text"),
            ("linkedin_url", "text"),
            ("twitter_handle", "text"),
            ("country_region", "text"),
            ("number_of_employees", "text"),   # source stores as text like "8484.0"
            ("macro_category", "text"),
            ("industry", "text"),
            ("subcategory", "text"),
            ("company_type", "text"),
            ("is_customer", "bool"),
            ("startup", "bool"),
            ("stay_on_top", "bool"),
            ("company_owner", "text"),
            ("sponsor_tier", "text"),
            ("sponsor_tier_rank", "int"),
            ("marketing_budget", "text"),
            ("total_revenue", "text"),
            ("hubspot_record_id", "text"),
            ("hs_create_date", "timestamptz"),
            ("summit_interest", "text"),
            ("conference_speaking", "text"),
            ("conferences", "jsonb"),
            ("technology", "jsonb"),
            ("rank_stage", "text"),
            ("rank_history", "jsonb"),
            ("rank_last_year", "int"),
            ("rank_frequency", "text"),
            ("pageviews_count", "int"),
            ("blockers_count", "int"),
            ("activity", "jsonb"),
            ("keep", "text"),
            ("\"group\"", "text"),            # reserved word; quoted
            ("last_activity_date", "timestamptz"),
            ("raw", "jsonb"),
            ("created_at", "timestamptz"),
            ("updated_at", "timestamptz"),
        ],
        array_columns=set(),
        jsonb_columns={"conferences", "technology", "rank_history", "activity", "raw"},
    ),
    TableSpec(
        name="contacts",
        columns=[
            ("id", "text"),
            ("company_id", "text"),
            ("first_name", "text"),
            ("last_name", "text"),
            ("full_name", "text"),
            ("email", "text"),
            ("email_domain", "text"),
            ("job_title", "text"),
            ("linkedin_url", "text"),
            ("phone", "text"),
            ("twitter_username", "text"),
            ("focus", "text"),
            ("deal_type", "text"),
            ("list_type", "text[]"),
            ("key_contact", "text"),
            ("lead_status", "text"),
            ("contact_owner", "text"),
            ("country_region", "text"),
            ("hubspot_record_id", "text"),
            ("hubspot_company_id", "text"),
            ("hs_create_date", "timestamptz"),
            ("marketing_contact_status", "text"),
            ("associated_company_ids", "text[]"),
            ("unsubscribed_all_email", "bool"),
            ("opted_out_marketing_info", "bool"),
            ("hard_bounce_reason", "text"),
            ("emails_delivered", "int"),
            ("emails_opened", "int"),
            ("emails_clicked", "int"),
            ("emails_bounced", "int"),
            ("emails_replied", "int"),
            ("times_contacted", "int"),
            ("last_activity_date", "timestamptz"),
            ("last_email_send_date", "timestamptz"),
            ("last_email_open_date", "timestamptz"),
            ("last_email_click_date", "timestamptz"),
            ("last_email_reply_date", "timestamptz"),
            ("recent_sales_email_open_date", "timestamptz"),
            ("recent_sales_email_click_date", "timestamptz"),
            ("raw", "jsonb"),
            ("created_at", "timestamptz"),
            ("updated_at", "timestamptz"),
        ],
        array_columns={"list_type", "associated_company_ids"},
        jsonb_columns={"raw"},
    ),
    TableSpec(
        name="activities",
        columns=[
            ("id", "text"),
            ("kind", "text"),
            ("actor", "text"),
            ("source", "text"),
            ("subject", "text"),
            ("body", "text"),
            ("contact_id", "text"),
            ("company_id", "text"),
            ("meta", "jsonb"),
            ("occurred_at", "timestamptz"),
            ("created_at", "timestamptz"),
        ],
        array_columns=set(),
        jsonb_columns={"meta"},
    ),
    TableSpec(
        name="tasks",
        columns=[
            ("id", "text"),
            ("title", "text"),
            ("detail", "text"),
            ("status", "text"),
            ("origin", "text"),
            ("assigned_to", "text"),
            ("contact_id", "text"),
            ("company_id", "text"),
            ("due_at", "timestamptz"),
            ("meta", "jsonb"),
            ("created_at", "timestamptz"),
            ("updated_at", "timestamptz"),
        ],
        array_columns=set(),
        jsonb_columns={"meta"},
    ),
    TableSpec(
        name="lists",
        columns=[
            ("id", "text"),
            ("name", "text"),
            ("slug", "text"),
            ("kind", "text"),
            ("purpose", "text"),
            ("description", "text"),
            ("owner", "text"),
            ("visibility", "text"),
            ("active", "bool"),
            ("pinned", "bool"),
            ("tags", "text[]"),
            ("entity_types", "text[]"),
            ("member_count", "int"),
            ("last_refreshed_at", "timestamptz"),
            ("meta", "jsonb"),
            ("created_at", "timestamptz"),
            ("updated_at", "timestamptz"),
        ],
        array_columns={"tags", "entity_types"},
        jsonb_columns={"meta"},
    ),
    TableSpec(
        name="list_members",
        columns=[
            ("id", "text"),
            ("list_id", "text"),
            ("entity_type", "text"),
            ("entity_id", "text"),
            ("role", "text"),
            ("added_at", "timestamptz"),
            ("added_by", "text"),
            ("source", "text"),
            ("meta", "jsonb"),
        ],
        array_columns=set(),
        jsonb_columns={"meta"},
    ),
    TableSpec(
        name="list_bindings",
        columns=[
            ("id", "text"),
            ("list_id", "text"),
            ("binding_type", "text"),
            ("binding_ref_id", "text"),
            ("active", "bool"),
            ("honor_suppressions", "bool"),
            ("suppression_list_ids", "text[]"),
            ("config", "jsonb"),
            ("created_at", "timestamptz"),
            ("updated_at", "timestamptz"),
        ],
        array_columns={"suppression_list_ids"},
        jsonb_columns={"config"},
    ),
    TableSpec(
        name="linkedin_topic_tags",
        columns=[
            ("slug", "text"),
            ("name", "text"),
            ("category", "text"),
            ("description", "text"),
            ("keyword_phrases", "text[]"),
            ("aliases", "text[]"),
            ("weight", "int"),
            ("active", "bool"),
            ("articles_30d", "int"),
            ("created_at", "timestamptz"),
            ("updated_at", "timestamptz"),
        ],
        array_columns={"keyword_phrases", "aliases"},
        jsonb_columns=set(),
    ),
    TableSpec(
        name="linkedin_monitor_configs",
        columns=[
            ("id", "text"),
            ("list_binding_id", "text"),
            ("name", "text"),
            ("active", "bool"),
            ("fetch_types", "text[]"),
            ("batch_size", "int"),
            ("cadence_seconds", "int"),
            ("jitter_seconds", "int"),
            ("per_fetch_delay_ms", "int"),
            ("score_posts", "bool"),
            ("topic_filter", "text[]"),
            ("relevance_min_score", "int"),
            ("run_cursor", "jsonb"),
            ("last_run_at", "timestamptz"),
            ("next_run_at", "timestamptz"),
            ("meta", "jsonb"),
            ("created_at", "timestamptz"),
            ("updated_at", "timestamptz"),
        ],
        array_columns={"fetch_types", "topic_filter"},
        jsonb_columns={"run_cursor", "meta"},
    ),
    TableSpec(
        name="linkedin_posts",
        columns=[
            ("id", "text"),
            ("monitor_config_id", "text"),
            ("entity_type", "text"),
            ("entity_id", "text"),
            ("post_urn", "text"),
            ("post_url", "text"),
            ("post_text", "text"),
            ("posted_at", "timestamptz"),
            ("media_kind", "text"),
            ("reactions", "int"),
            ("comments", "int"),
            ("reposts", "int"),
            ("keyword_hits", "text[]"),
            ("relevance_score", "int"),
            ("relevance_reason", "text"),
            ("relevance_topics", "text[]"),
            ("scorer_model", "text"),
            ("scored_at", "timestamptz"),
            ("first_seen_at", "timestamptz"),
            ("last_fetched_at", "timestamptz"),
            ("raw", "jsonb"),
            ("meta", "jsonb"),
        ],
        array_columns={"keyword_hits", "relevance_topics"},
        jsonb_columns={"raw", "meta"},
    ),
    TableSpec(
        name="linkedin_snapshots",
        columns=[
            ("id", "text"),
            ("monitor_config_id", "text"),
            ("entity_type", "text"),
            ("entity_id", "text"),
            ("fetch_type", "text"),
            ("source_url", "text"),
            ("http_status", "int"),
            ("content_hash", "text"),
            ("parsed", "jsonb"),
            ("raw_storage_path", "text"),
            ("firecrawl_job_id", "text"),
            ("error", "text"),
            ("fetched_at", "timestamptz"),
            ("meta", "jsonb"),
        ],
        array_columns=set(),
        jsonb_columns={"parsed", "meta"},
    ),
    TableSpec(
        name="social_mentions",
        columns=[
            ("id", "text"),                     # native platform post id, kept as text
            ("platform", "text"),
            ("topic", "text"),
            ("query", "text"),
            ("url", "text"),
            ("text", "text"),
            ("author_name", "text"),
            ("author_username", "text"),
            ("author_verified", "bool"),
            ("posted_at", "timestamptz"),
            ("fetched_at", "timestamptz"),
            ("like_count", "int"),
            ("reply_count", "int"),
            ("retweet_count", "int"),
            ("quote_count", "int"),
            ("bookmark_count", "int"),
            ("impression_count", "int"),
            ("reach_score", "int"),
            ("raw", "jsonb"),
        ],
        array_columns=set(),
        jsonb_columns={"raw"},
    ),
    TableSpec(
        name="social_refresh_log",
        columns=[
            ("id", "text"),
            ("ran_at", "timestamptz"),
            ("duration_ms", "int"),
            ("queries_run", "int"),
            ("posts_inserted", "int"),
            ("posts_updated", "int"),
            ("errors", "int"),
        ],
        array_columns=set(),
        jsonb_columns=set(),
    ),
]


def print_ddl() -> None:
    print("create schema if not exists stg_engager;\n")
    for spec in SPECS:
        print(spec.create_ddl())
        print()


def create_tables(conn: "psycopg.Connection", drop_first: bool) -> None:
    with conn.cursor() as cur:
        if drop_first:
            print("Dropping schema stg_engager (CASCADE)...")
            cur.execute("drop schema if exists stg_engager cascade;")
        cur.execute("create schema if not exists stg_engager;")
        for spec in SPECS:
            cur.execute(spec.create_ddl())
            print(f"  created stg_engager.{spec.name}")
    conn.commit()


def coerce(value: Any, is_array: bool, is_jsonb: bool) -> Any:
    """Coerce a JSONL value into a form psycopg can pass to COPY."""
    if value is None:
        return None
    if is_jsonb:
        # jsonb: pass as JSON string
        return json.dumps(value)
    if is_array:
        # Postgres array: ensure list of scalars
        if not isinstance(value, list):
            return None
        return value
    if isinstance(value, (dict, list)):
        # Non-jsonb column with a nested value — flatten to JSON string as last resort
        return json.dumps(value)
    return value


def load_table(conn: "psycopg.Connection", spec: TableSpec, snapshot_path: Path) -> tuple[int, int]:
    """Returns (rows_read, rows_loaded)."""
    if not snapshot_path.exists():
        print(f"  SKIP {spec.name}: {snapshot_path} not found")
        return (0, 0)

    col_names = spec.column_names()
    rows_read = 0
    rows_loaded = 0

    with conn.cursor() as cur:
        # Truncate first so re-runs are idempotent
        cur.execute(sql.SQL("truncate table stg_engager.{}").format(sql.Identifier(spec.name)))

        # Build COPY sql. Use unquoted col names except "group" which is already quoted.
        cols_sql = ", ".join(col_names)
        copy_sql = sql.SQL("copy stg_engager.{table} ({cols}) from stdin").format(
            table=sql.Identifier(spec.name),
            cols=sql.SQL(cols_sql),
        )

        with cur.copy(copy_sql) as copy:
            with open(snapshot_path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    rows_read += 1
                    row_dict = json.loads(line)
                    # Build row tuple in spec column order
                    row = []
                    for col_full, col_type in spec.columns:
                        # Strip quotes and get bare column name for dict lookup
                        col_bare = col_full.strip('"')
                        is_array = col_bare in spec.array_columns
                        is_jsonb = col_bare in spec.jsonb_columns
                        row.append(coerce(row_dict.get(col_bare), is_array, is_jsonb))
                    copy.write_row(row)
                    rows_loaded += 1

    conn.commit()
    return (rows_read, rows_loaded)


def main() -> int:
    parser = argparse.ArgumentParser(description="Load Engager JSONL snapshots into stg_engager.*")
    parser.add_argument("--print-ddl", action="store_true", help="Print CREATE TABLE DDL and exit")
    parser.add_argument("--tables-only", action="store_true", help="Only create tables; skip load")
    parser.add_argument("--load-only", action="store_true", help="Skip DDL; only load")
    parser.add_argument("--drop-first", action="store_true", help="DROP SCHEMA stg_engager CASCADE before creating")
    parser.add_argument("--snapshot-dir", type=Path, default=SNAPSHOT_DIR, help="Path to JSONL snapshot directory")
    args = parser.parse_args()

    if args.print_ddl:
        print_ddl()
        return 0

    if not _HAS_PSYCOPG:
        print("ERROR: psycopg not installed. Run: pip install 'psycopg[binary]>=3.1'", file=sys.stderr)
        return 1

    db_url = os.environ.get("DATABASE_URL_CANONICAL")
    if not db_url:
        print("ERROR: DATABASE_URL_CANONICAL not set", file=sys.stderr)
        return 2

    print(f"Connecting to canonical Neon...")
    with psycopg.connect(db_url) as conn:
        # Verify we're on canonical
        with conn.cursor() as cur:
            cur.execute("select current_database(), current_user;")
            db, user = cur.fetchone()
            print(f"  connected: db={db} user={user}")
            if db != "canonical":
                print(f"  WARNING: expected db=canonical, got {db}. Continuing anyway.")

        if not args.load_only:
            create_tables(conn, drop_first=args.drop_first)

        if args.tables_only:
            print("--tables-only set; skipping data load.")
            return 0

        print(f"\nLoading from {args.snapshot_dir}/*.jsonl")
        total_read = 0
        total_loaded = 0
        for spec in SPECS:
            snapshot_path = args.snapshot_dir / f"{spec.name}.jsonl"
            r, l = load_table(conn, spec, snapshot_path)
            print(f"  stg_engager.{spec.name:30} read={r:5d}  loaded={l:5d}")
            total_read += r
            total_loaded += l
        print(f"\nTOTAL: read={total_read}  loaded={total_loaded}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
