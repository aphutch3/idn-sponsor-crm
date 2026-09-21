-- 115_account_score_precision.sql
--
-- signals.account_score.score and its component columns were numeric(6,3),
-- which is right for a normalized 0-100 score and wrong for everything the
-- GitHub load needs to put in them.
--
-- Two separate problems, found by trying to load 6,621 GitHub people.
--
-- 1. PRECISION. GitHub influence is computed to six decimals (61.792489).
--    numeric(6,3) stores that as 61.792 and throws away the rest. The ranked
--    people view orders by influence, so rounding does not just lose detail --
--    it MANUFACTURES TIES between people the score actually separates, and the
--    order within a tie is then arbitrary. Same class of defect as
--    est_cost_usd silently rounding five-decimal charges.
--
-- 2. RANGE. reach_stars is up to 10,079,783 and would not fit at all: a field
--    with precision 6 must be under 1,000. That one is not a precision bug but
--    a modelling error on my part -- reach_stars is a COUNT of stars across the
--    repos a person contributes to, not a 0-100 reach SCORE, and forcing a
--    seven-digit count into a score column would have been meaningless even if
--    it fit. It stays in components, where the inputs to the score belong.
--
-- numeric(12,6) keeps every decimal the sources actually carry and leaves room
-- for a score that is not normalized to 100.

begin;

-- v_x_accounts_ranked depends on v_x_account_scores_latest, so the whole
-- three-view chain comes down and goes back up inside this one transaction.
drop view if exists compat.v_x_accounts_ranked;
drop view if exists compat.v_x_account_scores_latest;
drop view if exists compat.x_account_scores;

alter table signals.account_score
  alter column score      type numeric(12,6),
  alter column reach      type numeric(12,6),
  alter column engagement type numeric(12,6),
  alter column curation   type numeric(12,6),
  alter column cadence    type numeric(12,6);

comment on column signals.account_score.reach is
  'A normalized reach SCORE, not a raw count. Counts that feed a score belong in components.';

-- Recreated verbatim from their live definitions so this migration is
-- self-contained and replayable.
CREATE OR REPLACE VIEW compat.x_account_scores AS  SELECT s.id,
    pa.platform_account_id AS user_id,
    s.scored_at,
    s.score,
    s.reach,
    s.engagement,
    s.cadence,
    s.curation,
    s.components
   FROM signals.account_score s
     JOIN signals.platform_account pa ON pa.id = s.platform_account_id
  WHERE pa.platform = 'x'::text;

CREATE OR REPLACE VIEW compat.v_x_account_scores_latest AS  SELECT DISTINCT ON (pa.platform_account_id) pa.platform_account_id AS user_id,
    s.scored_at,
    s.score,
    s.reach,
    s.engagement,
    s.cadence,
    s.curation,
    s.components
   FROM signals.account_score s
     JOIN signals.platform_account pa ON pa.id = s.platform_account_id
  WHERE pa.platform = 'x'::text
  ORDER BY pa.platform_account_id, s.scored_at DESC;

CREATE OR REPLACE VIEW compat.v_x_accounts_ranked AS  WITH post_rollup AS (
         SELECT xp.author_account_id AS platform_account_id,
            count(*) AS post_count,
            COALESCE(max(COALESCE(pm.likes, 0::bigint) + COALESCE(pm.retweets, 0::bigint) * 2 + COALESCE(pm.replies, 0::bigint) * 3), 0::bigint) AS top_engagement
           FROM signals.content_x_post xp
             LEFT JOIN compat.x_latest_post_metric pm ON pm.content_item_id = xp.content_item_id
          WHERE xp.author_account_id IS NOT NULL
          GROUP BY xp.author_account_id
        ), list_rollup AS (
         SELECT x_list_member.platform_account_id,
            count(*) AS list_count
           FROM signals.x_list_member
          GROUP BY x_list_member.platform_account_id
        )
 SELECT pa.platform_account_id AS user_id,
    a.username,
    a.name,
    a.description,
    a.profile_image_url,
    a.verified,
    a.followers,
    a.following_count,
    a.tweet_count,
    a.listed_count,
    a.is_following,
    a.profile_synced_at,
    s.score,
    s.reach,
    s.engagement,
    s.cadence,
    s.curation,
    s.scored_at,
    COALESCE(lr.list_count, 0::bigint) AS list_count,
    COALESCE(pr.post_count, 0::bigint) AS post_count,
    COALESCE(pr.top_engagement, 0::bigint) AS top_engagement
   FROM signals.platform_account pa
     JOIN compat.x_accounts a ON a.user_id = pa.platform_account_id
     LEFT JOIN compat.v_x_account_scores_latest s ON s.user_id = pa.platform_account_id
     LEFT JOIN post_rollup pr ON pr.platform_account_id = pa.id
     LEFT JOIN list_rollup lr ON lr.platform_account_id = pa.id
  WHERE pa.platform = 'x'::text AND pa.platform_account_id IS NOT NULL;

commit;
