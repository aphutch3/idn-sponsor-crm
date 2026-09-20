"""Generate 64_content_contract.sql from hand-authored meanings plus the live DDL.

The meanings are authored here; the column list is read from the database so the
generated contract can never drift from the actual schema. Run after 60-63 are
applied to a scratch branch, then commit the generated SQL.
"""
import os
import psycopg2

CONN = os.environ["DATABASE_URL"]

# schema, table -> (purpose, row_grain, owning_domain, authority, pii_class)
OBJECTS = {
    ("public", "content_publication"): (
        "External website that hosts linked articles",
        "One normalized hosting domain", "content", "canonical", "none"),
    ("public", "content_source"): (
        "Channel that publishes content, such as a newsletter, social account or video channel",
        "One publishing channel", "content", "canonical", "internal"),
    ("public", "content_edition"): (
        "Dated issue of a periodical content source",
        "One issue of a source", "content", "canonical", "internal"),
    ("public", "content_item"): (
        "Addressable piece of published content, independent of platform",
        "One content item", "content", "canonical", "internal"),
    ("public", "content_newsletter_item"): (
        "Newsletter-specific placement detail for a content item",
        "One item placement within an edition", "content", "canonical", "internal"),
    ("public", "content_entity"): (
        "Governed relationship from a content item to a canonical entity",
        "One item-entity-role relationship", "content", "canonical", "personal"),
    ("public", "content_metric"): (
        "Append-only observation of a content metric at a point in time",
        "One metric observation", "content", "source evidence", "none"),
    ("public", "content_enrichment"): (
        "Model-derived scoring for a content item, retained with its producing model",
        "One content item", "content", "derived model output", "internal"),
    ("signals", "person_profile"): (
        "Tracked Signals individual; the row itself is the membership statement",
        "One canonical person", "signals", "app-owned", "personal"),
    ("signals", "reader_cache"): (
        "Operational cache of a fetched third-party article body, including retained failures",
        "One content item", "signals", "app-owned", "internal"),
}

CANON = "Typed canonical fact with retained source attribution; not an unqualified inferred truth"
APP = "app-owned"
EVIDENCE = "source evidence"
DERIVED = "derived model output"

# (schema, table, column) -> (meaning, authority, null_meaning, unit, pii_class, is_derived)
C = {}


def put(schema, table, rows):
    for col, spec in rows.items():
        C[(schema, table, col)] = spec


COMMON = {
    "id": ("Surrogate primary key", CANON, None, None, "none", False),
    "raw": ("Retained source payload for this row", EVIDENCE, None, None, "internal", False),
    "created_at": ("Row creation timestamp in this database", CANON, None, None, "none", False),
    "updated_at": ("Last modification timestamp in this database", CANON, None, None, "none", False),
    "source_system": ("Originating system code from public.source_system", CANON,
                      "Provenance not recorded", None, "none", False),
}

put("public", "content_publication", {
    **COMMON,
    "domain": ("Hosting site domain as supplied by the source", CANON, None, None, "none", False),
    "normalized_domain": ("Lowercased domain without a www prefix; the deduplication key",
                          CANON, None, None, "none", True),
    "name": ("Human readable publication name", CANON, "Name not known", None, "none", False),
    "company_id": ("Canonical public.company that owns this publication", CANON,
                   "Publication not yet resolved to a company", None, "none", False),
})

put("public", "content_source", {
    **COMMON,
    "slug": ("Stable human readable identifier for the channel", CANON, None, None, "none", False),
    "kind": ("Platform form of the content this channel publishes", CANON, None, None, "none", False),
    "name": ("Display name of the channel", CANON, None, None, "internal", False),
    "normalized_name": ("Case and punctuation folded name; the deduplication key",
                        CANON, None, None, "internal", True),
    "company_id": ("Canonical public.company that owns this channel", CANON,
                   "Channel is not owned by a company, or is not yet resolved", None, "none", False),
    "person_id": ("Canonical public.person who owns this channel when it is an individual creator",
                  CANON, "Channel is not an individual creator, or is not yet resolved",
                  None, "personal", False),
    "homepage_url": ("Public landing page for the channel", CANON, "Not known", None, "none", False),
    "feed_url": ("Machine readable feed or archive endpoint", CANON, "No feed known", None, "none", False),
    "external_handle": ("Platform handle or channel identifier on the originating platform",
                        CANON, "Not applicable to this platform", None, "internal", False),
    "is_active": ("Whether the channel is currently ingested", APP, None, None, "none", False),
    "description": ("Editorial description of the channel", CANON, "Not described", None, "internal", False),
})

put("public", "content_edition", {
    **COMMON,
    "content_source_id": ("Publishing channel this issue belongs to", CANON, None, None, "none", False),
    "edition_date": ("Calendar date the issue was published", CANON, None, None, "none", False),
    "edition_number": ("Publisher assigned sequential issue number", CANON,
                       "Publisher does not number issues", None, "none", False),
    "title": ("Issue title", CANON, "Untitled issue", None, "internal", False),
    "url": ("Public archive URL for the issue", CANON, "No archive page known", None, "none", False),
    "published_at": ("Publication instant when a precise time is known", CANON,
                     "Only the calendar date is known", None, "none", False),
})

put("public", "content_item", {
    **COMMON,
    "kind": ("Platform form of this content item", CANON, None, None, "none", False),
    "content_source_id": ("Channel that published this item", CANON,
                          "Item has no identified publishing channel", None, "none", False),
    "content_publication_id": ("External site hosting the linked article", CANON,
                               "Item is not a link to an external site", None, "none", False),
    "title": ("Headline as presented by the publishing channel", CANON, "Untitled", None, "internal", False),
    "summary": ("Short summary as supplied by the source", CANON, "No summary supplied", None, "internal", False),
    "body_text": ("Full text of the item when the channel itself publishes it", CANON,
                  "Body not published by this channel; fetched bodies live in signals.reader_cache",
                  None, "internal", False),
    "url": ("Destination URL for the item", CANON, "No URL supplied", None, "none", False),
    "canonical_url": ("Deduplicating URL; null where a URL legitimately repeats across placements",
                      CANON, "Item is a distinct placement and must not be deduplicated by URL",
                      None, "none", False),
    "author_person_id": ("Canonical public.person credited as author", CANON,
                         "Author not identified or not yet resolved", None, "personal", False),
    "published_at": ("Instant the item was published by the source", CANON,
                     "Publication time not supplied", None, "none", False),
    "language": ("BCP 47 language code of the item", CANON, "Language not determined", None, "none", False),
    "importance_score": ("Editorial importance ranking on a 0 to 100 scale", DERIVED,
                         "Not scored", "score 0-100", "none", True),
    "is_sponsored": ("Whether the item is paid placement", CANON, None, None, "none", False),
})

put("public", "content_newsletter_item", {
    "content_item_id": ("Content item this placement describes", CANON, None, None, "none", False),
    "content_edition_id": ("Issue in which the item appeared", CANON, None, None, "none", False),
    "section": ("Named section of the issue containing the item", CANON,
                "Issue is not sectioned", None, "internal", False),
    "position": ("Zero based ordinal of the item within the issue", CANON,
                 "Ordering not supplied", "ordinal", "none", False),
    "item_type": ("Publisher classification of the placement, such as article or sponsor",
                  CANON, "Not classified", None, "none", False),
    "read_time_minutes": ("Publisher stated reading time", CANON, "Not stated", "minutes", "none", False),
    "raw_url": ("Tracking or redirect URL exactly as published", EVIDENCE,
                "No tracking URL supplied", None, "none", False),
})

put("public", "content_entity", {
    "content_item_id": ("Content item the relationship originates from", CANON, None, None, "none", False),
    "entity_table": ("Approved canonical target kind for the relationship", CANON, None, None, "none", False),
    "entity_id": ("Identifier of the target row within the approved target kind", CANON,
                  None, None, "personal", False),
    "role": ("Nature of the relationship, such as author, mentioned or sponsor", CANON,
             None, None, "none", False),
    "confidence": ("Extraction confidence where the relationship was inferred", DERIVED,
                   "Relationship was asserted rather than inferred", "probability 0-1", "none", True),
    "evidence": ("Supporting evidence for the relationship", EVIDENCE, None, None, "internal", False),
    "source_system": ("System that asserted the relationship", CANON,
                      "Provenance not recorded", None, "none", False),
    "created_at": ("Row creation timestamp in this database", CANON, None, None, "none", False),
})

put("public", "content_metric", {
    "id": ("Surrogate primary key", CANON, None, None, "none", False),
    "content_item_id": ("Content item the observation describes", CANON, None, None, "none", False),
    "kind": ("Measure being observed", CANON, None, None, "none", False),
    "value": ("Observed value of the measure", EVIDENCE, None, "count", "none", False),
    "observed_at": ("Instant the measure was read from the source platform", EVIDENCE,
                    None, None, "none", False),
    "source_system": ("System the observation was read from", CANON,
                      "Provenance not recorded", None, "none", False),
})

put("public", "content_enrichment", {
    "content_item_id": ("Content item that was scored", CANON, None, None, "none", False),
    "sentiment": ("Categorical sentiment label", DERIVED, "Not scored", None, "internal", True),
    "sentiment_score": ("Signed sentiment magnitude", DERIVED, "Not scored", "score -1 to 1", "internal", True),
    "trend_score": ("Model estimate of topical momentum", DERIVED, "Not scored", "score", "internal", True),
    "engagement_score": ("Model estimate of expected engagement", DERIVED, "Not scored", "score", "internal", True),
    "ai_insight": ("Model authored analytical note", DERIVED, "No note produced", None, "internal", True),
    "model": ("Identifier of the model that produced this scoring", EVIDENCE,
              "Producing model not recorded", None, "internal", False),
    "scored_at": ("Instant the scoring was produced", EVIDENCE, "Not scored", None, "none", False),
    "raw": ("Retained model response payload", EVIDENCE, None, None, "internal", False),
})

put("signals", "person_profile", {
    "person_id": ("Canonical public.person tracked by Signals", APP, None, None, "personal", False),
    "tracked_since": ("Instant this person entered Signals tracking", APP, None, None, "none", False),
    "is_active": ("Whether the person is currently tracked", APP, None, None, "none", False),
    "archetype": ("Signals editorial archetype assignment", APP, "Not yet classified", None, "internal", False),
    "influence_score": ("Signals influence ranking on a 0 to 100 scale", DERIVED,
                        "Not scored", "score 0-100", "internal", True),
    "notes": ("Operator authored note", APP, "No note", None, "internal", False),
    "raw": ("Retained application payload", EVIDENCE, None, None, "internal", False),
    "created_at": ("Row creation timestamp in this database", APP, None, None, "none", False),
    "updated_at": ("Last modification timestamp in this database", APP, None, None, "none", False),
})

put("signals", "reader_cache", {
    "content_item_id": ("Content item whose body was fetched", APP, None, None, "none", False),
    "fetch_state": ("Outcome of the most recent prefetch attempt", APP, None, None, "none", False),
    "fetch_method": ("Extraction strategy that produced the body", APP,
                     "No attempt has succeeded", None, "none", False),
    "reader_title": ("Title found on the fetched page, retained separately because it "
                     "frequently disagrees with the published headline", APP,
                     "No body fetched", None, "internal", False),
    "reader_byline": ("Byline found on the fetched page", APP, "No byline found", None, "personal", False),
    "reader_content": ("Extracted article body text", APP, "No body fetched", None, "internal", False),
    "word_count": ("Length of the extracted body", DERIVED, "No body fetched", "words", "none", True),
    "fetched_at": ("Instant the body was successfully fetched", APP, "Never fetched", None, "none", False),
    "attempt_count": ("Number of prefetch attempts made", APP, None, "attempts", "none", False),
    "error": ("Failure reason retained so a failed fetch is not silently retried as new work",
              APP, "No failure recorded", None, "internal", False),
    "raw": ("Retained fetcher response metadata", EVIDENCE, None, None, "internal", False),
    "created_at": ("Row creation timestamp in this database", APP, None, None, "none", False),
    "updated_at": ("Last modification timestamp in this database", APP, None, None, "none", False),
})


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    conn = psycopg2.connect(CONN)
    cur = conn.cursor()
    missing, extra, obj_lines, col_lines = [], [], [], []

    for (schema, table), spec in sorted(OBJECTS.items()):
        purpose, grain, domain, authority, pii = spec
        obj_lines.append(
            f"  ({lit(schema)}, {lit(table)}, 'table', {lit(purpose)}, {lit(grain)}, "
            f"{lit(domain)}, {lit(authority)}, {lit(pii)}, 'active', null)")

        cur.execute("""select column_name from information_schema.columns
                       where table_schema=%s and table_name=%s order by ordinal_position""",
                    (schema, table))
        live = [r[0] for r in cur.fetchall()]
        if not live:
            raise SystemExit(f"Table not found in database: {schema}.{table}")
        for col in live:
            spec = C.get((schema, table, col))
            if spec is None:
                missing.append(f"{schema}.{table}.{col}")
                continue
            meaning, auth, null_meaning, unit, cpii, derived = spec
            col_lines.append(
                f"  ({lit(schema)}, {lit(table)}, {lit(col)}, {lit(meaning)}, {lit(auth)}, "
                f"{lit(null_meaning)}, {lit(unit)}, {lit(cpii)}, {lit(derived)})")
        for key in C:
            if key[0] == schema and key[1] == table and key[2] not in live:
                extra.append(".".join(key))

    if missing or extra:
        for m in missing:
            print("MISSING annotation for live column:", m)
        for e in sorted(set(extra)):
            print("ANNOTATION for non-existent column:", e)
        raise SystemExit("Contract does not match the live schema")

    sql = f"""-- IDN Canonical Schema Contract v2 :: content domain governance contract
-- Release candidate canonical-v2-content. Execute only through the guarded release runner.
--
-- GENERATED FILE. Edit gen_contract.py and regenerate; do not hand-edit.
-- Registers the content and Signals objects in the metadata catalogs so that
-- meta.table_catalog and meta.column_catalog describe them, records the Signals
-- source system, and declares the application access contract.

begin;

insert into public.source_system(code, name, description, is_active) values
  ('news_dashboard', 'IDN News Dashboard',
   'Supabase project ffvcpumtufsafckcpddi; newsletter, X, YouTube and GitHub signal ingestion.', true)
on conflict (code) do nothing;

insert into meta.app(code, name) values
  ('idn_signals', 'IDN Signals')
on conflict (code) do nothing;

insert into meta.object_annotation
  (schema_name, object_name, object_kind, purpose, row_grain,
   owning_domain, authority, pii_class, lifecycle_state, replacement_object)
values
{",\n".join(obj_lines)}
on conflict (schema_name, object_name) do update set
  purpose = excluded.purpose,
  row_grain = excluded.row_grain,
  owning_domain = excluded.owning_domain,
  authority = excluded.authority,
  pii_class = excluded.pii_class,
  lifecycle_state = excluded.lifecycle_state;

insert into meta.column_annotation
  (schema_name, table_name, column_name, meaning, authority,
   null_meaning, unit, pii_class, is_derived)
values
{",\n".join(col_lines)}
on conflict (schema_name, table_name, column_name) do update set
  meaning = excluded.meaning,
  authority = excluded.authority,
  null_meaning = excluded.null_meaning,
  unit = excluded.unit,
  pii_class = excluded.pii_class,
  is_derived = excluded.is_derived;

-- Register the new relations as bindable targets so meta.source_binding may
-- point at them under the same existence guarantee as every other target.
insert into meta.binding_target(relation_name, id_column) values
  ('public.content_source', 'id'),
  ('public.content_publication', 'id'),
  ('public.content_edition', 'id'),
  ('public.content_item', 'id'),
  ('public.content_metric', 'id'),
  ('signals.person_profile', 'person_id')
on conflict (relation_name) do nothing;

-- Signals runs server side under its own role. The browser never holds a
-- database credential, and the application never writes canonical identity:
-- it proposes, and identity resolution remains governed.
insert into meta.app_contract
  (app_code, role_name, schema_name, object_name, access_kind, purpose, requires_audit, approved_at)
values
  ('idn_signals', 'idn_signals_app', 'public', 'content_source', 'write',
   'Server-only Signals ingestion of channels, editions, items, relationships and metrics.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'content_publication', 'write',
   'Server-only Signals ingestion of channels, editions, items, relationships and metrics.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'content_edition', 'write',
   'Server-only Signals ingestion of channels, editions, items, relationships and metrics.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'content_item', 'write',
   'Server-only Signals ingestion of channels, editions, items, relationships and metrics.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'content_newsletter_item', 'write',
   'Server-only Signals ingestion of channels, editions, items, relationships and metrics.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'content_entity', 'write',
   'Server-only Signals ingestion of channels, editions, items, relationships and metrics.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'content_metric', 'write',
   'Server-only Signals ingestion of channels, editions, items, relationships and metrics.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'content_enrichment', 'write',
   'Server-only Signals enrichment scoring.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'external_ref', 'write',
   'Foreign identifier resolution for Signals ingestion.', true, now()),
  ('idn_signals', 'idn_signals_app', 'signals', 'person_profile', 'write',
   'Signals private membership and archetype profile.', true, now()),
  ('idn_signals', 'idn_signals_app', 'signals', 'reader_cache', 'write',
   'Signals private reader prefetch cache.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'person', 'propose',
   'Signals proposes canonical identity; it never writes person facts directly.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'company', 'propose',
   'Signals proposes canonical company identity; it never writes company facts directly.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'tag', 'read',
   'Signals reads the governed taxonomy and never auto-creates canonical tags.', true, now()),
  ('idn_signals', 'idn_signals_app', 'public', 'entity_tag', 'propose',
   'Signals proposes tag assignments under the governed taxonomy.', true, now())
on conflict (app_code, role_name, schema_name, object_name, access_kind) do nothing;

commit;
"""
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "normalized", "64_content_contract.sql")
    with open(out, "w") as fh:
        fh.write(sql)
    print(f"wrote {out}")
    print(f"objects={len(obj_lines)} columns={len(col_lines)}")


if __name__ == "__main__":
    main()
