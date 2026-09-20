"""Generate 78_signals_contract.sql from hand-authored meanings plus the live DDL.

Same contract as v2: meanings are authored here, the column list is read from
the database, and the run fails if the two disagree in EITHER direction. A
missing annotation is a hard error because meta.table_catalog is a view over
meta.object_annotation -- an unannotated table is invisible to the catalog, and
main enforces undocumented_cols = 0.

Usage:
  export DATABASE_URL='postgresql://...'
  python3 gen_contract_v3.py
"""
import os
import psycopg2

CONN = os.environ["DATABASE_URL"]

CANON = "Typed canonical fact with retained source attribution; not an unqualified inferred truth"
APP = "app-owned"
EVIDENCE = "source evidence"
DERIVED = "derived model output"
OBSERVED = "observed platform value"

# ---------------------------------------------------------------------------
# Object annotations: (schema, table) -> (purpose, row_grain, domain, authority, pii)
# ---------------------------------------------------------------------------
OBJECTS = {
    ("signals", "platform_account"): (
        "Observed account on an external platform, tracked independently of whether it is resolved to a canonical person",
        "One account on one platform", "signals", APP, "personal"),
    ("signals", "x_account_detail"): (
        "X specific attributes of a tracked platform account",
        "One X account", "signals", OBSERVED, "internal"),
    ("signals", "github_account_detail"): (
        "GitHub specific attributes of a tracked platform account",
        "One GitHub account", "signals", OBSERVED, "personal"),
    ("signals", "youtube_channel_detail"): (
        "YouTube specific attributes of a tracked platform account",
        "One YouTube channel", "signals", OBSERVED, "internal"),
    ("signals", "linkedin_account_detail"): (
        "LinkedIn specific attributes and rotation state of a tracked platform account",
        "One LinkedIn account", "signals", APP, "personal"),
    ("signals", "account_metric"): (
        "Append-only observation of an account level metric at a point in time",
        "One metric observation", "signals", EVIDENCE, "none"),
    ("signals", "content_x_post"): (
        "X specific detail for a content item of kind x_post",
        "One X post", "signals", OBSERVED, "internal"),
    ("signals", "content_youtube_video"): (
        "YouTube specific detail for a content item of kind youtube_video",
        "One YouTube video", "signals", OBSERVED, "internal"),
    ("signals", "content_github_repo"): (
        "GitHub repository detail for a content item of kind github_repo",
        "One repository", "signals", OBSERVED, "internal"),
    ("signals", "content_linkedin_post"): (
        "LinkedIn specific detail for a content item of kind linkedin_post",
        "One LinkedIn post", "signals", OBSERVED, "internal"),
    ("signals", "job_request"): (
        "Operator or scheduler request for background work, replacing six per-domain request tables",
        "One requested job", "signals", APP, "internal"),
    ("signals", "job_run"): (
        "Execution record of background work, replacing seven per-domain run tables",
        "One job execution", "signals", APP, "internal"),
    ("signals", "job_metric_kind"): (
        "Controlled vocabulary of job counters, replacing sparse per-domain count columns",
        "One counter definition", "signals", APP, "none"),
    ("signals", "job_run_metric"): (
        "One counter value produced by one job run",
        "One counter observation for one run", "signals", EVIDENCE, "none"),
    ("signals", "repo_contribution_week"): (
        "Commits by one account to one repository in one week; the contribution fact grain",
        "One account, repository and week", "signals", EVIDENCE, "internal"),
    ("signals", "repo_contributor"): (
        "Derived per contributor rollup of the weekly contribution grain, materialized for read performance",
        "One account and repository", "signals", DERIVED, "internal"),
    ("signals", "pull_request_merge"): (
        "Sampled pull request author and merger pair, the evidence behind the GitHub authority signal",
        "One pull request", "signals", EVIDENCE, "internal"),
    ("signals", "tag"): (
        "Signals working tag vocabulary, promoted to the governed taxonomy by review rather than automatically",
        "One working tag", "signals", APP, "none"),
    ("signals", "tag_alias"): (
        "Raw extracted string that resolves to a working tag",
        "One alias string", "signals", EVIDENCE, "none"),
    ("signals", "tag_daily_stat"): (
        "Derived daily coverage and sentiment rollup for a working tag",
        "One tag and day", "signals", DERIVED, "none"),
    ("signals", "tag_cooccurrence"): (
        "Derived count of an unordered tag pair appearing together, stored once per pair",
        "One unordered tag pair", "signals", DERIVED, "none"),
    ("signals", "tag_merge_suggestion"): (
        "Proposed merge of two working tags awaiting human review",
        "One proposed merge", "signals", DERIVED, "none"),
    ("signals", "x_list"): (
        "Curated X list tracked for membership and timeline sweeps",
        "One X list", "signals", APP, "internal"),
    ("signals", "x_list_member"): (
        "Membership of an account in a tracked X list",
        "One list and account", "signals", OBSERVED, "personal"),
    ("signals", "x_bookmark"): (
        "Operator bookmarked post",
        "One bookmarked content item", "signals", APP, "internal"),
    ("signals", "content_cluster"): (
        "Generated topic cluster over content items for a named preset",
        "One generated cluster", "signals", DERIVED, "internal"),
    ("signals", "content_cluster_member"): (
        "Membership of a content item in a generated cluster, replacing an identifier array",
        "One cluster and item", "signals", DERIVED, "none"),
    ("signals", "signal_capture"): (
        "Record that a content item satisfied a named signal preset",
        "One preset and item", "signals", EVIDENCE, "none"),
    ("signals", "account_score"): (
        "Append-only account scoring history retained with the model that produced it",
        "One account and scoring instant", "signals", DERIVED, "internal"),
    ("signals", "linkedin_engagement_observation"): (
        "Observed engagement by a tracked LinkedIn profile, used to detect activity for rotation banding",
        "One observed engagement", "signals", EVIDENCE, "personal"),
    ("signals", "conference"): (
        "External conference whose programme is used for speaker prospecting",
        "One conference edition", "signals", EVIDENCE, "none"),
    ("signals", "speaker_profile"): (
        "Scraped speaker prospect, linked to canonical identity only once confidently matched",
        "One speaker prospect", "signals", APP, "personal"),
    ("signals", "conference_session"): (
        "Programme session at an external conference",
        "One session", "signals", EVIDENCE, "internal"),
    ("signals", "session_speaker"): (
        "Participation of a speaker prospect in a conference session",
        "One session and speaker", "signals", EVIDENCE, "none"),
    ("signals", "speaker_list"): (
        "Operator curated list of speaker prospects for outreach",
        "One list", "signals", APP, "internal"),
    ("signals", "speaker_list_member"): (
        "Membership of a speaker prospect in a curated outreach list",
        "One list and prospect", "signals", APP, "personal"),
    ("signals", "major_publication"): (
        "Publication featured in The Majors editorial surface",
        "One featured publication", "signals", APP, "none"),
    ("signals", "major_analysis"): (
        "Generated analysis panel for a featured publication, upserted per kind",
        "One publication and analysis kind", "signals", DERIVED, "internal"),
    ("signals", "dropdown_option"): (
        "Operator editable select option used by the Signals interface",
        "One option within a group", "signals", APP, "none"),
}

# ---------------------------------------------------------------------------
# Column annotations
# ---------------------------------------------------------------------------
C = {}


def put(schema, table, rows):
    for col, spec in rows.items():
        C[(schema, table, col)] = spec


def n(meaning, authority=CANON, null_meaning=None, unit=None, pii="none", derived=False):
    return (meaning, authority, null_meaning, unit, pii, derived)


ID = n("Surrogate primary key")
CREATED = n("Row creation timestamp in this database")
UPDATED = n("Last modification timestamp in this database")
RAW = n("Retained source payload for this row", EVIDENCE, None, None, "internal")
SRCSYS = n("Originating system code from public.source_system", CANON,
           "Provenance not recorded")
ACCT = n("Tracked platform account this row describes", CANON)
ITEM = n("Content item this row describes", CANON)
COMPUTED = n("Timestamp the derived values were last rebuilt", DERIVED, None, None, "none", True)

put("signals", "platform_account", {
    "id": ID,
    "platform": n("External platform the account exists on"),
    "handle": n("Handle exactly as observed on the platform", OBSERVED, None, None, "personal"),
    "normalized_handle": n(
        "Lowercased handle with any URL wrapper removed; the display identity deduplication key",
        CANON, None, None, "personal", True),
    "platform_account_id": n(
        "Stable numeric or opaque identifier assigned by the platform, which survives a rename",
        OBSERVED, "Platform identifier not captured, so only the handle identifies this account",
        None, "personal"),
    "display_name": n("Profile display name as observed", OBSERVED, "Not published", None, "personal"),
    "description": n("Profile biography as observed", OBSERVED, "Not published", None, "personal"),
    "url": n("Canonical profile URL on the platform", OBSERVED, "Not captured"),
    "avatar_url": n("Profile image URL as observed", OBSERVED, "Not captured"),
    "location": n("Self reported location as observed", OBSERVED, "Not published", None, "personal"),
    "is_verified": n("Whether the platform marks the account verified", OBSERVED, "Verification state unknown"),
    "account_created_at": n("Instant the account was created on the platform", OBSERVED, "Not published"),
    "person_id": n(
        "Canonical public.person this account belongs to",
        CANON, "Account is not yet resolved to a canonical person, which is the normal initial state",
        None, "personal"),
    "person_handle_id": n(
        "Governed public.person_handle row mirroring this account once it is resolved",
        CANON, "Account has no governed handle row, because it is unresolved or unpromoted",
        None, "personal"),
    "first_seen_at": n("Instant this account was first observed by Signals", APP),
    "last_synced_at": n("Instant the profile was last refreshed from the platform", APP, "Never synced"),
    "is_monitored": n("Whether Signals actively ingests this account", APP),
    "source_system": SRCSYS,
    "raw": RAW,
    "created_at": CREATED,
    "updated_at": UPDATED,
})

put("signals", "x_account_detail", {
    "platform_account_id": ACCT,
    "is_following": n("Whether the operator account follows this account", OBSERVED, "Follow state not checked"),
    "listed_count": n("Number of public lists containing this account", OBSERVED, "Not captured", "lists"),
    "categories": n("Platform assigned professional categories", OBSERVED, "None assigned"),
    "profile_synced_at": n("Instant X profile fields were last refreshed", APP, "Never synced"),
})

put("signals", "github_account_detail", {
    "platform_account_id": ACCT,
    "account_type": n("Whether the GitHub account is a user or an organization", OBSERVED, "Not determined"),
    "actor_class": n("Classification of the account as human, bot or agent", DERIVED, "Not classified", None, "none", True),
    "agent_vendor": n("Vendor of the coding agent when the account is an agent", DERIVED, "Not an agent account", None, "none", True),
    "company_raw": n("Employer string exactly as self reported on the profile", OBSERVED, "Not published", None, "personal"),
    "company_norm": n("Case and punctuation folded employer string used for matching", DERIVED, "No employer to normalize", None, "personal", True),
    "company_id": n("Canonical public.company matched from the self reported employer", CANON,
                    "Employer absent or not yet resolved to a canonical company"),
    "email": n("Public profile email address", OBSERVED, "Not published", None, "personal"),
    "blog": n("Personal site URL from the profile", OBSERVED, "Not published"),
    "public_repos": n("Count of public repositories at last sync", OBSERVED, "Not captured", "repositories"),
    "profile_fetched_at": n("Instant GitHub profile fields were last refreshed", APP, "Never fetched"),
})

put("signals", "youtube_channel_detail", {
    "platform_account_id": ACCT,
    "playlist_id": n("Uploads playlist identifier used to enumerate videos", OBSERVED, "Not resolved"),
    "beat": n("Editorial beat this channel is tracked under", APP, "Not assigned"),
    "list_name": n("Operator grouping label for the channel", APP, "Not grouped"),
    "source_kind": n("How the channel entered the tracking set", APP, "Not recorded"),
    "note": n("Operator note about the channel", APP, "No note", None, "internal"),
    "last_video_at": n("Publication instant of the most recent known video", DERIVED, "No videos known", None, "none", True),
    "first_ingested_at": n("Instant this channel was first ingested", APP, "Never ingested"),
    "last_ingested_at": n("Instant this channel was last ingested", APP, "Never ingested"),
})

put("signals", "linkedin_account_detail", {
    "platform_account_id": ACCT,
    "slug": n("Public profile slug from the LinkedIn URL", OBSERVED, "Not captured", None, "personal"),
    "headline": n("Profile headline as observed", OBSERVED, "Not published", None, "personal"),
    "band": n("Rotation band controlling sweep frequency", APP, "Not banded"),
    "score": n("Priority score used to order sweeps", DERIVED, "Not scored", None, "none", True),
    "url_type": n("Whether the profile URL is a public vanity slug or an opaque identifier", OBSERVED, "Not classified"),
    "source": n("How this profile entered the roster", APP, "Not recorded"),
    "is_pinned": n("Whether the operator pinned this profile into every sweep", APP),
    "is_probation": n("Whether the profile is on probation for repeatedly returning no result", APP),
    "is_self_confirmed": n("Whether the profile was confirmed by the person themselves", APP),
    "cooldown_until": n("Instant before which this profile must not be swept again", APP, "No cooldown in force"),
    "last_swept_at": n("Instant this profile was last swept", APP, "Never swept"),
    "last_authored_at": n("Publication instant of the most recent authored post found", OBSERVED, "No authored post found"),
    "notes": n("Operator note about the profile", APP, "No note", None, "internal"),
})

put("signals", "account_metric", {
    "id": ID,
    "platform_account_id": ACCT,
    "kind": n("Which account level metric this observation records"),
    "value": n("Observed metric value at observed_at", EVIDENCE, None, "count"),
    "observed_at": n("Instant the metric was observed", EVIDENCE),
    "source_system": SRCSYS,
})

put("signals", "content_x_post", {
    "content_item_id": ITEM,
    "tweet_id": n("Platform assigned post identifier", OBSERVED),
    "conversation_id": n("Identifier of the conversation thread containing the post", OBSERVED,
                         "Not captured"),
    "author_account_id": n("Tracked account that authored the post", CANON,
                           "Author account not tracked or not yet resolved", None, "personal"),
    "is_reply": n("Whether the post replies to another post", OBSERVED),
    "is_quote": n("Whether the post quotes another post", OBSERVED),
    "is_repost": n("Whether the post is a repost of another post", OBSERVED),
    "entities": n("Platform supplied entity annotations such as mentions and links", EVIDENCE,
                  "No annotations supplied", None, "internal"),
    "referenced": n("Platform supplied references to other posts", EVIDENCE,
                    "No references supplied", None, "internal"),
    "synced_at": n("Instant post fields were last refreshed", APP, "Never refreshed"),
})

put("signals", "content_youtube_video", {
    "content_item_id": ITEM,
    "video_id": n("Platform assigned video identifier", OBSERVED),
    "channel_account_id": n("Tracked channel account that published the video", CANON,
                            "Channel not tracked or not yet resolved"),
    "duration_seconds": n("Video duration", OBSERVED, "Duration not captured", "seconds"),
    "is_short": n("Whether the video is a Short", DERIVED, "Format not determined", None, "none", True),
    "thumbnail_url": n("Thumbnail image URL", OBSERVED, "Not captured"),
    "published_text": n("Relative publication string exactly as scraped, such as two weeks ago",
                        EVIDENCE, "Not scraped", None, "internal"),
    "is_published_estimated": n(
        "Whether published_at was derived from a relative string rather than an exact timestamp",
        DERIVED, None, None, "none", True),
    "ingest_depth": n("How deeply the channel was walked when this video was found", APP,
                      "Not recorded"),
    "ingested_at": n("Instant the video was ingested", APP),
})

put("signals", "content_github_repo", {
    "content_item_id": ITEM,
    "repo_id": n("Platform assigned repository identifier", OBSERVED),
    "owner_login": n("Repository owner login as observed", OBSERVED, None, None, "personal"),
    "repo_name": n("Repository name without the owner prefix", OBSERVED),
    "owner_account_id": n("Tracked account that owns the repository", CANON,
                          "Owner not tracked or not yet resolved", None, "personal"),
    "company_id": n("Canonical public.company that owns the repository", CANON,
                    "Repository is not corporately owned, or is not yet resolved"),
    "primary_language": n("Dominant programming language reported by the platform", OBSERVED,
                          "Not reported"),
    "license": n("Declared license identifier", OBSERVED, "No license declared"),
    "homepage": n("Project homepage URL", OBSERVED, "Not published"),
    "size_kb": n("Repository size reported by the platform", OBSERVED, "Not captured", "kilobytes"),
    "is_archived": n("Whether the platform marks the repository archived", OBSERVED,
                     "Archive state unknown"),
    "is_monitored": n("Whether Signals actively tracks this repository", APP),
    "repo_created_at": n("Instant the repository was created", OBSERVED, "Not captured"),
    "pushed_at": n("Instant of the most recent push", OBSERVED, "Not captured"),
    "last_release_at": n("Instant of the most recent release", OBSERVED, "No release found"),
    "metrics_fetched_at": n("Instant repository metrics were last refreshed", APP, "Never fetched"),
})

put("signals", "content_linkedin_post", {
    "content_item_id": ITEM,
    "post_urn": n("LinkedIn assigned post identifier", OBSERVED),
    "author_account_id": n("Tracked account that authored the post", CANON,
                           "Author not tracked or not yet resolved", None, "personal"),
    "is_repost": n("Whether the post is a repost", OBSERVED),
    "is_quote": n("Whether the post quotes another post", OBSERVED),
    "ingested_at": n("Instant the post was ingested", APP),
})

put("signals", "job_request", {
    "id": ID,
    "kind": n("Which kind of background work was requested", APP),
    "status": n("Lifecycle state of the request", APP),
    "params": n("Request parameters supplied by the caller", APP, "No parameters supplied",
                None, "internal"),
    "requested_at": n("Instant the work was requested", APP),
    "requested_by": n("Identifier of the operator or scheduler that requested the work", APP,
                      "Requester not recorded", None, "internal"),
    "started_at": n("Instant a worker claimed the request", APP, "Not yet claimed"),
    "finished_at": n("Instant the request reached a terminal state", APP, "Still pending or running"),
    "summary": n("Structured outcome reported by the worker", APP, "No outcome recorded yet",
                 None, "internal"),
    "error": n("Failure cause when the request failed", APP, "Request did not fail",
               None, "internal"),
    "run_id": n("Execution that fulfilled this request", APP, "Not yet executed"),
})

put("signals", "job_run", {
    "id": ID,
    "kind": n("Which kind of background work executed", APP),
    "status": n("Lifecycle state of the execution", APP),
    "job_request_id": n("Request that triggered this execution", APP,
                        "Execution was scheduled rather than requested by an operator"),
    "started_at": n("Instant execution began", APP),
    "finished_at": n("Instant execution reached a terminal state", APP, "Still running"),
    "api_calls": n("Number of external API calls made", EVIDENCE, "Not counted", "calls"),
    "est_cost_usd": n("Estimated external API cost of this execution", DERIVED,
                      "Not estimated", "USD", "none", True),
    "params": n("Effective parameters used by the execution", APP, "No parameters",
                None, "internal"),
    "summary": n("Structured outcome reported by the execution", APP, "No outcome recorded",
                 None, "internal"),
    "error": n("Failure cause when the execution failed", APP, "Execution did not fail",
               None, "internal"),
})

put("signals", "job_metric_kind", {
    "code": n("Stable counter code referenced by job run metrics", APP),
    "label": n("Human readable counter name", APP),
    "unit": n("Unit the counter is expressed in", APP, "Dimensionless count"),
    "description": n("What the counter measures", APP, "Not described"),
})

put("signals", "job_run_metric", {
    "job_run_id": n("Execution that produced this counter", APP),
    "metric_code": n("Which counter this value records", APP),
    "value": n("Counter value for this execution", EVIDENCE, None, "count"),
})

put("signals", "repo_contribution_week", {
    "content_item_id": n("Repository the commits were made to", CANON),
    "platform_account_id": n("Account credited with the commits", CANON, None, None, "personal"),
    "week_starting": n("Sunday beginning the weekly bucket reported by the platform", EVIDENCE),
    "commits": n("Commits credited in this week", EVIDENCE, None, "commits"),
})

put("signals", "repo_contributor", {
    "content_item_id": n("Repository this rollup describes", CANON),
    "platform_account_id": n("Account this rollup describes", CANON, None, None, "personal"),
    "commits_total": n("Total commits across all known weeks", DERIVED, None, "commits", "none", True),
    "commits_365d": n("Commits in the trailing 365 days", DERIVED, None, "commits", "none", True),
    "commits_90d": n("Commits in the trailing 90 days", DERIVED, None, "commits", "none", True),
    "weeks_active": n("Number of weeks with at least one commit", DERIVED, None, "weeks", "none", True),
    "first_commit_week": n("Earliest week with a commit", DERIVED, "No commits recorded", None, "none", True),
    "last_commit_week": n("Most recent week with a commit", DERIVED, "No commits recorded", None, "none", True),
    "share_total": n("Share of all repository commits attributable to this account", DERIVED,
                     "Not computed", "fraction 0-1", "none", True),
    "share_90d": n("Share of trailing 90 day repository commits attributable to this account",
                   DERIVED, "Not computed", "fraction 0-1", "none", True),
    "rank_commits": n("Rank of this account among repository contributors by commits", DERIVED,
                      "Not ranked", "rank", "none", True),
    "is_top10": n("Whether the account is among the ten leading contributors", DERIVED,
                  None, None, "none", True),
    "importance": n("Composite contributor importance measure", DERIVED, "Not computed",
                    None, "none", True),
    "prs_authored": n("Pull requests authored by this account in the sampled window", EVIDENCE,
                      "Not sampled", "pull requests"),
    "prs_merged": n("Pull requests authored by this account that were merged", EVIDENCE,
                    "Not sampled", "pull requests"),
    "merges_performed": n("Pull requests this account merged for others", EVIDENCE,
                          "Not sampled", "pull requests"),
    "computed_at": COMPUTED,
})

put("signals", "pull_request_merge", {
    "content_item_id": n("Repository the pull request belongs to", CANON),
    "pr_number": n("Pull request number within the repository", OBSERVED),
    "author_account_id": n("Account that authored the pull request", CANON,
                           "Author not tracked or not yet resolved", None, "personal"),
    "merged_by_account_id": n("Account that merged the pull request", CANON,
                              "Not merged, or merger not tracked", None, "personal"),
    "merged_at": n("Instant the pull request was merged", OBSERVED, "Not merged"),
    "sampled_at": n("Instant this pull request was sampled", APP),
})

put("signals", "tag", {
    "id": ID,
    "slug": n("Stable lowercase identifier for the working tag", APP),
    "display_name": n("Human readable tag label", APP),
    "description": n("Editorial description of the tag", APP, "Not described", None, "internal"),
    "color": n("Display colour for the tag", APP, "No colour assigned"),
    "parent_id": n("Broader working tag containing this one", APP, "Tag is a root of the hierarchy"),
    "canonical_tag_id": n(
        "Governed public.tag this working tag has been promoted to",
        CANON, "Working tag has not been promoted to the governed taxonomy"),
    "is_curated": n("Whether a human has reviewed this tag", APP),
    "created_at": CREATED,
    "updated_at": UPDATED,
})

put("signals", "tag_alias", {
    "id": ID,
    "tag_id": n("Working tag this alias resolves to", APP),
    "raw_alias": n("Alias string exactly as extracted", EVIDENCE),
    "normalized_alias": n(
        "Lowercased alias with separators unified and punctuation removed; the global resolution key",
        DERIVED, None, None, "none", True),
    "confidence": n("Model confidence that the alias resolves to this tag", DERIVED,
                    "Alias was asserted by a human rather than scored", "fraction 0-1", "none", True),
    "source_system": SRCSYS,
    "created_at": CREATED,
})

put("signals", "tag_daily_stat", {
    "tag_id": n("Working tag this rollup describes", APP),
    "day": n("Calendar day the rollup covers", DERIVED, None, None, "none", True),
    "article_count": n("Content items carrying this tag on this day", DERIVED, None,
                       "items", "none", True),
    "avg_importance": n("Mean importance score of those items", DERIVED, "No items that day",
                        "score 0-100", "none", True),
    "sentiment_pos": n("Items classified positive", DERIVED, None, "items", "none", True),
    "sentiment_neu": n("Items classified neutral", DERIVED, None, "items", "none", True),
    "sentiment_neg": n("Items classified negative", DERIVED, None, "items", "none", True),
    "computed_at": COMPUTED,
})

put("signals", "tag_cooccurrence", {
    "tag_a": n("Lower ordered tag of the pair; the ordering is enforced so a pair has one row",
               DERIVED, None, None, "none", True),
    "tag_b": n("Higher ordered tag of the pair", DERIVED, None, None, "none", True),
    "cooccurrences": n("Content items carrying both tags", DERIVED, None, "items", "none", True),
    "last_seen_at": n("Instant the pair was most recently seen together", DERIVED,
                      "Not recorded", None, "none", True),
    "computed_at": COMPUTED,
})

put("signals", "tag_merge_suggestion", {
    "id": ID,
    "from_tag_id": n("Working tag proposed to be absorbed", DERIVED, None, None, "none", True),
    "into_tag_id": n("Working tag proposed to absorb the other", DERIVED, None, None, "none", True),
    "reason": n("Explanation of why the merge was proposed", DERIVED, "No reason recorded",
                None, "internal", True),
    "score": n("Confidence that the two tags are the same concept", DERIVED, "Not scored",
               "fraction 0-1", "none", True),
    "status": n("Review state of the suggestion", APP),
    "created_at": CREATED,
    "decided_at": n("Instant a human decided the suggestion", APP, "Still awaiting review"),
})

put("signals", "x_list", {
    "id": ID,
    "list_id": n("Platform assigned list identifier", OBSERVED),
    "name": n("List name as observed", OBSERVED),
    "description": n("List description as observed", OBSERVED, "Not published", None, "internal"),
    "owner_account_id": n("Tracked account that owns the list", CANON,
                          "Owner not tracked or not yet resolved", None, "personal"),
    "is_private": n("Whether the list is private on the platform", OBSERVED),
    "list_created_at": n("Instant the list was created", OBSERVED, "Not captured"),
    "members_synced_at": n("Instant list membership was last refreshed", APP, "Never synced"),
    "timeline_synced_at": n("Instant the list timeline was last swept", APP, "Never swept"),
    "created_at": CREATED,
    "updated_at": UPDATED,
})

put("signals", "x_list_member", {
    "x_list_id": n("List the account belongs to", CANON),
    "platform_account_id": n("Account in the list", CANON, None, None, "personal"),
    "first_seen_at": n("Instant the account was first seen in the list", EVIDENCE),
    "last_seen_at": n("Instant the account was most recently confirmed in the list", EVIDENCE,
                      "Membership not reconfirmed since first observation"),
})

put("signals", "x_bookmark", {
    "content_item_id": n("Bookmarked content item", CANON),
    "position": n("Ordering position in the operator bookmark list", APP, "Unordered", "rank"),
    "synced_at": n("Instant the bookmark was last confirmed from the platform", APP),
})

put("signals", "content_cluster", {
    "id": ID,
    "preset": n("Named signal preset the cluster was generated for", APP),
    "label": n("Generated cluster label", DERIVED, None, None, "none", True),
    "summary": n("Generated cluster summary", DERIVED, "Not summarized", None, "internal", True),
    "built_at": n("Instant the cluster was generated", DERIVED, None, None, "none", True),
    "top_engagement": n("Highest engagement value among clustered items", DERIVED,
                        "Not computed", "count", "none", True),
})

put("signals", "content_cluster_member", {
    "content_cluster_id": n("Cluster the item belongs to", DERIVED, None, None, "none", True),
    "content_item_id": n("Clustered content item", DERIVED, None, None, "none", True),
    "rank": n("Ordering of the item within the cluster", DERIVED, "Unranked", "rank", "none", True),
})

put("signals", "signal_capture", {
    "preset": n("Named signal preset that matched", APP),
    "content_item_id": n("Content item that satisfied the preset", CANON),
    "fetched_at": n("Instant the match was recorded", EVIDENCE),
})

put("signals", "account_score", {
    "id": ID,
    "platform_account_id": n("Account this score describes", CANON, None, None, "personal"),
    "score": n("Composite account score", DERIVED, None, "score", "none", True),
    "reach": n("Reach component of the composite score", DERIVED, "Component not computed",
               "score", "none", True),
    "engagement": n("Engagement component of the composite score", DERIVED,
                    "Component not computed", "score", "none", True),
    "curation": n("Curation component of the composite score", DERIVED,
                  "Component not computed", "score", "none", True),
    "cadence": n("Posting cadence component of the composite score", DERIVED,
                 "Component not computed", "score", "none", True),
    "components": n("Retained inputs and weights behind this score, kept so a historical score stays explainable",
                    DERIVED, None, None, "internal", True),
    "scored_at": n("Instant the score was computed", DERIVED, None, None, "none", True),
    "model_version": n("Version of the scoring model that produced this score", DERIVED,
                       "Model version not recorded", None, "none", True),
})

put("signals", "linkedin_engagement_observation", {
    "id": ID,
    "content_item_id": n("Post that was engaged with", CANON,
                         "Engaged post is not ingested as a content item"),
    "platform_account_id": n("Tracked profile that engaged", CANON, None, None, "personal"),
    "post_urn": n("LinkedIn identifier of the engaged post", OBSERVED, "Not captured"),
    "posted_at": n("Publication instant of the engaged post", OBSERVED, "Not captured"),
    "observed_at": n("Instant the engagement was observed", EVIDENCE),
})

put("signals", "conference", {
    "id": ID,
    "slug": n("Stable identifier for the conference edition", APP),
    "name": n("Conference name", EVIDENCE),
    "edition": n("Edition label such as a year or series marker", EVIDENCE, "Not labelled"),
    "starts_on": n("First day of the conference", EVIDENCE, "Dates not published"),
    "ends_on": n("Last day of the conference", EVIDENCE, "Dates not published"),
    "source_url": n("Page the programme was collected from", EVIDENCE, "Not recorded"),
    "created_at": CREATED,
})

put("signals", "speaker_profile", {
    "id": ID,
    "full_name": n("Speaker name exactly as published in the programme", EVIDENCE, None, None, "personal"),
    "title": n("Job title as published", EVIDENCE, "Not published", None, "personal"),
    "bio": n("Speaker biography as published", EVIDENCE, "Not published", None, "personal"),
    "person_id": n("Canonical public.person this prospect was matched to", CANON,
                   "Prospect is unmatched, so no canonical person record is implied", None, "personal"),
    "company_id": n("Canonical public.company this prospect was matched to", CANON,
                    "Employer unmatched or not published"),
    "company_raw": n("Employer string exactly as published in the programme", EVIDENCE,
                     "Not published", None, "personal"),
    "archetype": n("Assigned editorial archetype of strategist, architect or engineer", DERIVED,
                   "Not yet assigned", None, "none", True),
    "influence_score": n("Composite prospect influence measure", DERIVED, "Not scored",
                         "score 0-100", "none", True),
    "x_account_id": n("Tracked X account belonging to this prospect", CANON,
                      "No X account found or confirmed", None, "personal"),
    "linkedin_account_id": n("Tracked LinkedIn account belonging to this prospect", CANON,
                             "No LinkedIn account found or confirmed", None, "personal"),
    "source_url": n("Programme page this prospect was collected from", EVIDENCE, "Not recorded"),
    "created_at": CREATED,
    "updated_at": UPDATED,
})

put("signals", "conference_session", {
    "id": ID,
    "conference_id": n("Conference this session belongs to", CANON),
    "title": n("Session title as published", EVIDENCE),
    "abstract": n("Session abstract as published", EVIDENCE, "Not published", None, "internal"),
    "session_date": n("Day the session took place", EVIDENCE, "Not published"),
    "track": n("Programme track containing the session", EVIDENCE, "Not tracked"),
    "source_url": n("Page the session was collected from", EVIDENCE, "Not recorded"),
})

put("signals", "session_speaker", {
    "conference_session_id": n("Session that was presented", CANON),
    "speaker_profile_id": n("Speaker prospect who presented", CANON, None, None, "personal"),
    "speaker_role": n("Role the speaker held in the session", EVIDENCE, "Role not distinguished"),
})

put("signals", "speaker_list", {
    "id": ID,
    "slug": n("Stable identifier for the outreach list", APP),
    "name": n("List name", APP),
    "description": n("What the list is for", APP, "Not described", None, "internal"),
    "created_at": CREATED,
})

put("signals", "speaker_list_member", {
    "speaker_list_id": n("Outreach list the prospect belongs to", APP),
    "speaker_profile_id": n("Speaker prospect on the list", APP, None, None, "personal"),
    "position": n("Ordering position in the list", APP, "Unordered", "rank"),
    "note": n("Operator note about this prospect on this list", APP, "No note", None, "internal"),
    "added_at": n("Instant the prospect was added to the list", APP),
})

put("signals", "major_publication", {
    "id": ID,
    "slug": n("Stable identifier for the featured publication", APP),
    "name": n("Display name of the publication", APP),
    "view_type": n("Which custom analysis panel renders for this publication; the standard article feed renders regardless",
                   APP),
    "content_source_id": n("Canonical content channel this publication corresponds to", CANON,
                           "Not linked to an ingested channel"),
    "is_active": n("Whether the publication is currently featured", APP),
    "position": n("Ordering position in The Majors index", APP, "Unordered", "rank"),
    "created_at": CREATED,
    "updated_at": UPDATED,
})

put("signals", "major_analysis", {
    "major_publication_id": n("Featured publication this analysis describes", APP),
    "kind": n("Which analysis panel this payload populates", APP),
    "payload": n("Generated analysis content for the panel", DERIVED, None, None, "internal", True),
    "generated_at": n("Instant the analysis was generated", DERIVED, None, None, "none", True),
    "model_version": n("Model that produced the analysis", DERIVED, "Not recorded", None, "none", True),
})

put("signals", "dropdown_option", {
    "id": ID,
    "group_code": n("Option group this value belongs to", APP),
    "value": n("Stored value submitted by the interface", APP),
    "label": n("Label shown to the operator", APP),
    "position": n("Ordering position within the group", APP, None, "rank"),
    "is_active": n("Whether the option is currently offered", APP),
    "created_at": CREATED,
})


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    return "'" + str(v).replace("'", "''") + "'"


# Relations that may be referenced polymorphically by meta.source_binding.
BINDING_TARGETS = [
    ("signals.platform_account", "id"),
    ("signals.tag", "id"),
    ("signals.speaker_profile", "id"),
    ("signals.major_publication", "id"),
    ("signals.job_run", "id"),
]

# app_code must satisfy CHECK (~ '^[a-z][a-z0-9_]*$').
WRITE_TABLES = [
    ("platform_account", "Server-only ingestion of observed platform accounts."),
    ("x_account_detail", "Platform-specific account attributes."),
    ("github_account_detail", "Platform-specific account attributes."),
    ("youtube_channel_detail", "Platform-specific account attributes."),
    ("linkedin_account_detail", "Platform-specific account attributes and rotation state."),
    ("account_metric", "Append-only account metric observations."),
    ("content_x_post", "Platform-specific content detail."),
    ("content_youtube_video", "Platform-specific content detail."),
    ("content_github_repo", "Platform-specific content detail."),
    ("content_linkedin_post", "Platform-specific content detail."),
    ("job_request", "Background work queue owned by the application."),
    ("job_run", "Background work execution log owned by the application."),
    ("job_run_metric", "Per-run counters owned by the application."),
    ("repo_contribution_week", "Contribution grain ingestion."),
    ("repo_contributor", "Derived contributor rollup rebuild."),
    ("pull_request_merge", "Pull request authority sampling."),
    ("tag", "Signals working tag vocabulary, distinct from the governed taxonomy."),
    ("tag_alias", "Alias resolution for the working vocabulary."),
    ("tag_daily_stat", "Derived tag rollups."),
    ("tag_cooccurrence", "Derived tag pair rollups."),
    ("tag_merge_suggestion", "Proposed tag merges awaiting review."),
    ("x_list", "Curated X list tracking."),
    ("x_list_member", "Curated X list membership."),
    ("x_bookmark", "Operator bookmarks."),
    ("content_cluster", "Generated topic clusters."),
    ("content_cluster_member", "Generated cluster membership."),
    ("signal_capture", "Signal preset match log."),
    ("account_score", "Append-only account scoring history."),
    ("linkedin_engagement_observation", "Observed LinkedIn engagement."),
    ("conference", "Scraped conference programmes."),
    ("speaker_profile", "Speaker prospects, which never write canonical identity."),
    ("conference_session", "Scraped conference sessions."),
    ("session_speaker", "Scraped session participation."),
    ("speaker_list", "Operator outreach lists."),
    ("speaker_list_member", "Operator outreach list membership."),
    ("major_publication", "Editorial Majors configuration."),
    ("major_analysis", "Generated Majors analysis panels."),
    ("dropdown_option", "Operator-editable interface options."),
]

READ_ONLY = [
    ("job_metric_kind", "read", "Controlled counter vocabulary is release-managed, not app-written."),
]


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
            spec2 = C.get((schema, table, col))
            if spec2 is None:
                missing.append(f"{schema}.{table}.{col}")
                continue
            meaning, auth, null_meaning, unit, cpii, derived = spec2
            col_lines.append(
                f"  ({lit(schema)}, {lit(table)}, {lit(col)}, {lit(meaning)}, {lit(auth)}, "
                f"{lit(null_meaning)}, {lit(unit)}, {lit(cpii)}, {lit(derived)})")
        for key in C:
            if key[0] == schema and key[1] == table and key[2] not in live:
                extra.append(".".join(key))

    # Every signals table created by this release must be annotated. Catch a new
    # table that was added to the migrations but never to OBJECTS.
    cur.execute("""select table_name from information_schema.tables
                   where table_schema='signals' and table_type='BASE TABLE'
                     and table_name not in ('person_profile','reader_cache')""")
    live_tables = {r[0] for r in cur.fetchall()}
    annotated = {t for (s, t) in OBJECTS}
    unannotated = live_tables - annotated
    if unannotated:
        for t in sorted(unannotated):
            print("MISSING object annotation for live table: signals." + t)

    if missing or extra or unannotated:
        for m in missing:
            print("MISSING annotation for live column:", m)
        for e in sorted(set(extra)):
            print("ANNOTATION for non-existent column:", e)
        raise SystemExit("Contract does not match the live schema")

    bind_lines = ",\n".join(
        f"  ({lit(r)}, {lit(c)})" for r, c in BINDING_TARGETS)
    contract_lines = ",\n".join(
        f"  ('idn_signals', 'idn_signals_app', 'signals', {lit(t)}, 'write',\n   {lit(p)}, true, now())"
        for t, p in WRITE_TABLES
    ) + ",\n" + ",\n".join(
        f"  ('idn_signals', 'idn_signals_app', 'signals', {lit(t)}, {lit(k)},\n   {lit(p)}, true, now())"
        for t, k, p in READ_ONLY)

    sql = f"""-- IDN Canonical Schema Contract v3 :: Signals domain governance contract
-- Release candidate canonical-v3-signals. Execute only through the guarded release runner.
--
-- GENERATED FILE. Edit gen_contract_v3.py and regenerate; do not hand-edit.
--
-- Registers every object created by 70-77 in the metadata catalogs so that
-- meta.table_catalog and meta.column_catalog describe them, and declares the
-- Signals application access contract. The generator fails if any live column
-- lacks a meaning or any annotation names a column that does not exist, so this
-- file cannot drift from the schema it documents.

begin;

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

-- Relations that may be referenced polymorphically by meta.source_binding.
insert into meta.binding_target(relation_name, id_column) values
{bind_lines}
on conflict (relation_name) do nothing;

-- Signals runs server side under its own role. The browser never holds a
-- database credential. The application owns its private schema outright but
-- still only proposes canonical identity, which is why no contract row here
-- grants write on any public table.
insert into meta.app_contract
  (app_code, role_name, schema_name, object_name, access_kind, purpose, requires_audit, approved_at)
values
{contract_lines}
on conflict (app_code, role_name, schema_name, object_name, access_kind) do nothing;

commit;
"""
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "normalized", "78_signals_contract.sql")
    with open(out, "w") as fh:
        fh.write(sql)
    print(f"wrote {out}")
    print(f"objects={len(obj_lines)} columns={len(col_lines)}")


if __name__ == "__main__":
    main()
