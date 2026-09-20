-- IDN Canonical Schema Contract v2 :: content domain governance contract
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
  ('public', 'content_edition', 'table', 'Dated issue of a periodical content source', 'One issue of a source', 'content', 'canonical', 'internal', 'active', null),
  ('public', 'content_enrichment', 'table', 'Model-derived scoring for a content item, retained with its producing model', 'One content item', 'content', 'derived model output', 'internal', 'active', null),
  ('public', 'content_entity', 'table', 'Governed relationship from a content item to a canonical entity', 'One item-entity-role relationship', 'content', 'canonical', 'personal', 'active', null),
  ('public', 'content_item', 'table', 'Addressable piece of published content, independent of platform', 'One content item', 'content', 'canonical', 'internal', 'active', null),
  ('public', 'content_metric', 'table', 'Append-only observation of a content metric at a point in time', 'One metric observation', 'content', 'source evidence', 'none', 'active', null),
  ('public', 'content_newsletter_item', 'table', 'Newsletter-specific placement detail for a content item', 'One item placement within an edition', 'content', 'canonical', 'internal', 'active', null),
  ('public', 'content_publication', 'table', 'External website that hosts linked articles', 'One normalized hosting domain', 'content', 'canonical', 'none', 'active', null),
  ('public', 'content_source', 'table', 'Channel that publishes content, such as a newsletter, social account or video channel', 'One publishing channel', 'content', 'canonical', 'internal', 'active', null),
  ('signals', 'person_profile', 'table', 'Tracked Signals individual; the row itself is the membership statement', 'One canonical person', 'signals', 'app-owned', 'personal', 'active', null),
  ('signals', 'reader_cache', 'table', 'Operational cache of a fetched third-party article body, including retained failures', 'One content item', 'signals', 'app-owned', 'internal', 'active', null)
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
  ('public', 'content_edition', 'id', 'Surrogate primary key', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_edition', 'content_source_id', 'Publishing channel this issue belongs to', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_edition', 'edition_date', 'Calendar date the issue was published', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_edition', 'edition_number', 'Publisher assigned sequential issue number', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Publisher does not number issues', null, 'none', false),
  ('public', 'content_edition', 'title', 'Issue title', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Untitled issue', null, 'internal', false),
  ('public', 'content_edition', 'url', 'Public archive URL for the issue', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'No archive page known', null, 'none', false),
  ('public', 'content_edition', 'published_at', 'Publication instant when a precise time is known', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Only the calendar date is known', null, 'none', false),
  ('public', 'content_edition', 'source_system', 'Originating system code from public.source_system', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Provenance not recorded', null, 'none', false),
  ('public', 'content_edition', 'raw', 'Retained source payload for this row', 'source evidence', null, null, 'internal', false),
  ('public', 'content_edition', 'created_at', 'Row creation timestamp in this database', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_edition', 'updated_at', 'Last modification timestamp in this database', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_enrichment', 'content_item_id', 'Content item that was scored', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_enrichment', 'sentiment', 'Categorical sentiment label', 'derived model output', 'Not scored', null, 'internal', true),
  ('public', 'content_enrichment', 'sentiment_score', 'Signed sentiment magnitude', 'derived model output', 'Not scored', 'score -1 to 1', 'internal', true),
  ('public', 'content_enrichment', 'trend_score', 'Model estimate of topical momentum', 'derived model output', 'Not scored', 'score', 'internal', true),
  ('public', 'content_enrichment', 'engagement_score', 'Model estimate of expected engagement', 'derived model output', 'Not scored', 'score', 'internal', true),
  ('public', 'content_enrichment', 'ai_insight', 'Model authored analytical note', 'derived model output', 'No note produced', null, 'internal', true),
  ('public', 'content_enrichment', 'model', 'Identifier of the model that produced this scoring', 'source evidence', 'Producing model not recorded', null, 'internal', false),
  ('public', 'content_enrichment', 'scored_at', 'Instant the scoring was produced', 'source evidence', 'Not scored', null, 'none', false),
  ('public', 'content_enrichment', 'raw', 'Retained model response payload', 'source evidence', null, null, 'internal', false),
  ('public', 'content_entity', 'content_item_id', 'Content item the relationship originates from', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_entity', 'entity_table', 'Approved canonical target kind for the relationship', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_entity', 'entity_id', 'Identifier of the target row within the approved target kind', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'personal', false),
  ('public', 'content_entity', 'role', 'Nature of the relationship, such as author, mentioned or sponsor', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_entity', 'confidence', 'Extraction confidence where the relationship was inferred', 'derived model output', 'Relationship was asserted rather than inferred', 'probability 0-1', 'none', true),
  ('public', 'content_entity', 'source_system', 'System that asserted the relationship', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Provenance not recorded', null, 'none', false),
  ('public', 'content_entity', 'evidence', 'Supporting evidence for the relationship', 'source evidence', null, null, 'internal', false),
  ('public', 'content_entity', 'created_at', 'Row creation timestamp in this database', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_item', 'id', 'Surrogate primary key', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_item', 'kind', 'Platform form of this content item', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_item', 'content_source_id', 'Channel that published this item', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Item has no identified publishing channel', null, 'none', false),
  ('public', 'content_item', 'content_publication_id', 'External site hosting the linked article', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Item is not a link to an external site', null, 'none', false),
  ('public', 'content_item', 'title', 'Headline as presented by the publishing channel', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Untitled', null, 'internal', false),
  ('public', 'content_item', 'summary', 'Short summary as supplied by the source', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'No summary supplied', null, 'internal', false),
  ('public', 'content_item', 'body_text', 'Full text of the item when the channel itself publishes it', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Body not published by this channel; fetched bodies live in signals.reader_cache', null, 'internal', false),
  ('public', 'content_item', 'url', 'Destination URL for the item', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'No URL supplied', null, 'none', false),
  ('public', 'content_item', 'canonical_url', 'Deduplicating URL; null where a URL legitimately repeats across placements', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Item is a distinct placement and must not be deduplicated by URL', null, 'none', false),
  ('public', 'content_item', 'author_person_id', 'Canonical public.person credited as author', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Author not identified or not yet resolved', null, 'personal', false),
  ('public', 'content_item', 'published_at', 'Instant the item was published by the source', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Publication time not supplied', null, 'none', false),
  ('public', 'content_item', 'language', 'BCP 47 language code of the item', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Language not determined', null, 'none', false),
  ('public', 'content_item', 'importance_score', 'Editorial importance ranking on a 0 to 100 scale', 'derived model output', 'Not scored', 'score 0-100', 'none', true),
  ('public', 'content_item', 'is_sponsored', 'Whether the item is paid placement', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_item', 'source_system', 'Originating system code from public.source_system', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Provenance not recorded', null, 'none', false),
  ('public', 'content_item', 'raw', 'Retained source payload for this row', 'source evidence', null, null, 'internal', false),
  ('public', 'content_item', 'created_at', 'Row creation timestamp in this database', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_item', 'updated_at', 'Last modification timestamp in this database', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_metric', 'id', 'Surrogate primary key', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_metric', 'content_item_id', 'Content item the observation describes', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_metric', 'kind', 'Measure being observed', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_metric', 'value', 'Observed value of the measure', 'source evidence', null, 'count', 'none', false),
  ('public', 'content_metric', 'observed_at', 'Instant the measure was read from the source platform', 'source evidence', null, null, 'none', false),
  ('public', 'content_metric', 'source_system', 'System the observation was read from', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Provenance not recorded', null, 'none', false),
  ('public', 'content_newsletter_item', 'content_item_id', 'Content item this placement describes', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_newsletter_item', 'content_edition_id', 'Issue in which the item appeared', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_newsletter_item', 'section', 'Named section of the issue containing the item', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Issue is not sectioned', null, 'internal', false),
  ('public', 'content_newsletter_item', 'position', 'Zero based ordinal of the item within the issue', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Ordering not supplied', 'ordinal', 'none', false),
  ('public', 'content_newsletter_item', 'item_type', 'Publisher classification of the placement, such as article or sponsor', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Not classified', null, 'none', false),
  ('public', 'content_newsletter_item', 'read_time_minutes', 'Publisher stated reading time', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Not stated', 'minutes', 'none', false),
  ('public', 'content_newsletter_item', 'raw_url', 'Tracking or redirect URL exactly as published', 'source evidence', 'No tracking URL supplied', null, 'none', false),
  ('public', 'content_publication', 'id', 'Surrogate primary key', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_publication', 'domain', 'Hosting site domain as supplied by the source', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_publication', 'normalized_domain', 'Lowercased domain without a www prefix; the deduplication key', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', true),
  ('public', 'content_publication', 'name', 'Human readable publication name', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Name not known', null, 'none', false),
  ('public', 'content_publication', 'company_id', 'Canonical public.company that owns this publication', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Publication not yet resolved to a company', null, 'none', false),
  ('public', 'content_publication', 'source_system', 'Originating system code from public.source_system', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Provenance not recorded', null, 'none', false),
  ('public', 'content_publication', 'raw', 'Retained source payload for this row', 'source evidence', null, null, 'internal', false),
  ('public', 'content_publication', 'created_at', 'Row creation timestamp in this database', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_publication', 'updated_at', 'Last modification timestamp in this database', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_source', 'id', 'Surrogate primary key', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_source', 'slug', 'Stable human readable identifier for the channel', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_source', 'kind', 'Platform form of the content this channel publishes', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_source', 'name', 'Display name of the channel', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'internal', false),
  ('public', 'content_source', 'normalized_name', 'Case and punctuation folded name; the deduplication key', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'internal', true),
  ('public', 'content_source', 'company_id', 'Canonical public.company that owns this channel', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Channel is not owned by a company, or is not yet resolved', null, 'none', false),
  ('public', 'content_source', 'person_id', 'Canonical public.person who owns this channel when it is an individual creator', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Channel is not an individual creator, or is not yet resolved', null, 'personal', false),
  ('public', 'content_source', 'homepage_url', 'Public landing page for the channel', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Not known', null, 'none', false),
  ('public', 'content_source', 'feed_url', 'Machine readable feed or archive endpoint', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'No feed known', null, 'none', false),
  ('public', 'content_source', 'external_handle', 'Platform handle or channel identifier on the originating platform', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Not applicable to this platform', null, 'internal', false),
  ('public', 'content_source', 'is_active', 'Whether the channel is currently ingested', 'app-owned', null, null, 'none', false),
  ('public', 'content_source', 'description', 'Editorial description of the channel', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Not described', null, 'internal', false),
  ('public', 'content_source', 'source_system', 'Originating system code from public.source_system', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', 'Provenance not recorded', null, 'none', false),
  ('public', 'content_source', 'raw', 'Retained source payload for this row', 'source evidence', null, null, 'internal', false),
  ('public', 'content_source', 'created_at', 'Row creation timestamp in this database', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('public', 'content_source', 'updated_at', 'Last modification timestamp in this database', 'Typed canonical fact with retained source attribution; not an unqualified inferred truth', null, null, 'none', false),
  ('signals', 'person_profile', 'person_id', 'Canonical public.person tracked by Signals', 'app-owned', null, null, 'personal', false),
  ('signals', 'person_profile', 'tracked_since', 'Instant this person entered Signals tracking', 'app-owned', null, null, 'none', false),
  ('signals', 'person_profile', 'is_active', 'Whether the person is currently tracked', 'app-owned', null, null, 'none', false),
  ('signals', 'person_profile', 'archetype', 'Signals editorial archetype assignment', 'app-owned', 'Not yet classified', null, 'internal', false),
  ('signals', 'person_profile', 'influence_score', 'Signals influence ranking on a 0 to 100 scale', 'derived model output', 'Not scored', 'score 0-100', 'internal', true),
  ('signals', 'person_profile', 'notes', 'Operator authored note', 'app-owned', 'No note', null, 'internal', false),
  ('signals', 'person_profile', 'raw', 'Retained application payload', 'source evidence', null, null, 'internal', false),
  ('signals', 'person_profile', 'created_at', 'Row creation timestamp in this database', 'app-owned', null, null, 'none', false),
  ('signals', 'person_profile', 'updated_at', 'Last modification timestamp in this database', 'app-owned', null, null, 'none', false),
  ('signals', 'reader_cache', 'content_item_id', 'Content item whose body was fetched', 'app-owned', null, null, 'none', false),
  ('signals', 'reader_cache', 'fetch_state', 'Outcome of the most recent prefetch attempt', 'app-owned', null, null, 'none', false),
  ('signals', 'reader_cache', 'fetch_method', 'Extraction strategy that produced the body', 'app-owned', 'No attempt has succeeded', null, 'none', false),
  ('signals', 'reader_cache', 'reader_title', 'Title found on the fetched page, retained separately because it frequently disagrees with the published headline', 'app-owned', 'No body fetched', null, 'internal', false),
  ('signals', 'reader_cache', 'reader_byline', 'Byline found on the fetched page', 'app-owned', 'No byline found', null, 'personal', false),
  ('signals', 'reader_cache', 'reader_content', 'Extracted article body text', 'app-owned', 'No body fetched', null, 'internal', false),
  ('signals', 'reader_cache', 'word_count', 'Length of the extracted body', 'derived model output', 'No body fetched', 'words', 'none', true),
  ('signals', 'reader_cache', 'fetched_at', 'Instant the body was successfully fetched', 'app-owned', 'Never fetched', null, 'none', false),
  ('signals', 'reader_cache', 'attempt_count', 'Number of prefetch attempts made', 'app-owned', null, 'attempts', 'none', false),
  ('signals', 'reader_cache', 'error', 'Failure reason retained so a failed fetch is not silently retried as new work', 'app-owned', 'No failure recorded', null, 'internal', false),
  ('signals', 'reader_cache', 'raw', 'Retained fetcher response metadata', 'source evidence', null, null, 'internal', false),
  ('signals', 'reader_cache', 'created_at', 'Row creation timestamp in this database', 'app-owned', null, null, 'none', false),
  ('signals', 'reader_cache', 'updated_at', 'Last modification timestamp in this database', 'app-owned', null, null, 'none', false)
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
