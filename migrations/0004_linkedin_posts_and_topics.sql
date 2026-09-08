-- LinkedIn post monitoring: individually-addressable posts, IDN topic taxonomy,
-- relevance scoring, and per-monitor topic filters.
-- Complements 0003 (which stores whole-page snapshots + change signals).

-- --------------------------------------------------------------------
-- IDN topic taxonomy — imported from the TLDR News Dashboard tag list.
-- Used both by the keyword pre-filter and the LLM classifier.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_topic_tags (
  slug              text PRIMARY KEY,
  name              text NOT NULL,
  category          text,
  description       text,
  aliases           text[] NOT NULL DEFAULT ARRAY[]::text[],
  keyword_phrases   text[] NOT NULL DEFAULT ARRAY[]::text[],
  articles_30d      int NOT NULL DEFAULT 0,
  active            boolean NOT NULL DEFAULT true,
  weight            numeric NOT NULL DEFAULT 1.0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS linkedin_topic_tags_active_idx ON linkedin_topic_tags (active) WHERE active;
CREATE INDEX IF NOT EXISTS linkedin_topic_tags_category_idx ON linkedin_topic_tags (category) WHERE active;
CREATE INDEX IF NOT EXISTS linkedin_topic_tags_articles_idx ON linkedin_topic_tags (articles_30d DESC);
CREATE TRIGGER linkedin_topic_tags_updated_at BEFORE UPDATE ON linkedin_topic_tags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------------
-- Individual LinkedIn posts. One row per (post_urn), regardless of how
-- many monitor runs surface it.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_urn              text NOT NULL UNIQUE,
  entity_type           text NOT NULL CHECK (entity_type IN ('company', 'contact')),
  entity_id             uuid NOT NULL,
  posted_at             timestamptz,
  post_text             text,
  post_url              text,
  media_kind            text,
  reactions             int,
  comments              int,
  reposts               int,
  raw                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- relevance scoring
  keyword_hits          text[] NOT NULL DEFAULT ARRAY[]::text[],
  relevance_score       numeric,
  relevance_topics      text[] NOT NULL DEFAULT ARRAY[]::text[],
  relevance_reason      text,
  scored_at             timestamptz,
  scorer_model          text,
  -- provenance
  monitor_config_id     uuid REFERENCES linkedin_monitor_configs(id) ON DELETE SET NULL,
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_fetched_at       timestamptz NOT NULL DEFAULT now(),
  meta                  jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS linkedin_posts_entity_idx ON linkedin_posts (entity_type, entity_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_posts_score_idx ON linkedin_posts (relevance_score DESC NULLS LAST, posted_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_posts_topics_idx ON linkedin_posts USING gin (relevance_topics);
CREATE INDEX IF NOT EXISTS linkedin_posts_keywords_idx ON linkedin_posts USING gin (keyword_hits);
CREATE INDEX IF NOT EXISTS linkedin_posts_config_idx ON linkedin_posts (monitor_config_id, first_seen_at DESC);

-- --------------------------------------------------------------------
-- Monitor extensions: relevance threshold + optional topic filter.
-- Existing configs default to score >= 60, no topic filter.
-- --------------------------------------------------------------------
ALTER TABLE linkedin_monitor_configs
  ADD COLUMN IF NOT EXISTS relevance_min_score numeric NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS topic_filter text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS score_posts boolean NOT NULL DEFAULT true;

-- --------------------------------------------------------------------
-- RLS: service role only, like the other linkedin_* tables.
-- --------------------------------------------------------------------
ALTER TABLE linkedin_topic_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_posts       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS linkedin_topic_tags_service_all ON linkedin_topic_tags;
DROP POLICY IF EXISTS linkedin_posts_service_all       ON linkedin_posts;

CREATE POLICY linkedin_topic_tags_service_all ON linkedin_topic_tags FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY linkedin_posts_service_all       ON linkedin_posts       FOR ALL TO service_role USING (true) WITH CHECK (true);
