-- 108_linkedin_fixes.sql
--
-- Two facts the legacy LinkedIn tables carry that the canonical tables had
-- nowhere to put. Applied before the load so nothing is silently dropped.
--
-- 1. WHO WAS ENGAGED WITH.
--    linkedin_engagement records that a roster profile engaged with someone
--    else's post, and carries that other person's slug, name and URL. The
--    canonical observation table recorded only the roster profile, so the
--    entire other half of the edge -- the thing the network view exists to
--    show -- had no home.
--
--    The author is stored as a REFERENCE to signals.platform_account rather
--    than as three denormalized text columns repeated across every
--    observation. That is the whole point of the canonical model: an author
--    who is also on the roster is then the SAME row as their roster profile,
--    not a string that happens to match, and a rename updates one place.
--
--    It also makes "in roster" a real question instead of a string lookup:
--    every LinkedIn account we have ever seen is a platform_account, and
--    roster membership is exactly the presence of a linkedin_account_detail
--    row. The legacy view answered it with an EXISTS against a slug.
--
-- 2. THE X HANDLE ON A ROSTER PROFILE.
--    140 of 452 profiles carry one, and the workspace displays it. It is
--    kept as the raw handle here rather than resolved to the X
--    platform_account, because resolving it is entity resolution: the same
--    human may hold both accounts, but asserting that link without evidence
--    would merge two identities on the strength of a self-reported string.
--    person_id on platform_account is where that link belongs once the
--    resolution pass has evidence for it.

begin;

alter table signals.linkedin_engagement_observation
  add column if not exists author_account_id uuid
    references signals.platform_account (id) on delete set null;

comment on column signals.linkedin_engagement_observation.author_account_id is
  'The account whose post was engaged with. Roster membership is the presence of a linkedin_account_detail row for this account, not a separate flag.';

-- The network view groups every observation by author, so the author is the
-- access path, not an incidental column.
create index if not exists linkedin_engagement_author_ix
  on signals.linkedin_engagement_observation (author_account_id)
  where author_account_id is not null;

-- One observation is one roster profile engaging with one post at one instant.
-- Without this a re-run of the loader would insert the same edge again, and
-- the network counts are literally counts of these rows.
create unique index if not exists linkedin_engagement_observation_uk
  on signals.linkedin_engagement_observation
     (platform_account_id, post_urn, observed_at);

alter table signals.linkedin_account_detail
  add column if not exists x_handle text;

comment on column signals.linkedin_account_detail.x_handle is
  'Self-reported X handle from the LinkedIn profile. NOT resolved to the X platform_account: that assertion needs evidence and belongs on platform_account.person_id.';

commit;
