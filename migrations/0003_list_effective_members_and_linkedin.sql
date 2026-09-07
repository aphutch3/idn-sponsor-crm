-- ============================================================
-- 0003 · Effective-members function + LinkedIn monitoring
-- ============================================================
-- Applied to wpgfanjopuupjcgrdbmb on 2026-09-07.

CREATE OR REPLACE FUNCTION list_effective_members(
  p_list_id uuid,
  p_honor_suppressions boolean DEFAULT true,
  p_suppression_list_ids uuid[] DEFAULT NULL
) RETURNS TABLE (out_entity_type list_entity_type, out_entity_id uuid)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_kind list_kind;
BEGIN
  SELECT kind INTO v_kind FROM lists WHERE id = p_list_id AND active;
  IF v_kind IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT lm.entity_type AS et, lm.entity_id AS eid, lm.role AS r
    FROM list_members lm WHERE lm.list_id = p_list_id
  ),
  included AS (
    SELECT b.et, b.eid FROM base b WHERE b.r = 'include'
    EXCEPT
    SELECT b.et, b.eid FROM base b WHERE b.r = 'exclude'
  ),
  suppressions AS (
    SELECT lm.entity_type AS et, lm.entity_id AS eid
    FROM list_members lm
    JOIN lists l ON l.id = lm.list_id
    WHERE p_honor_suppressions
      AND l.kind = 'suppression'
      AND l.active
      AND lm.role = 'include'
      AND (p_suppression_list_ids IS NULL OR l.id = ANY(p_suppression_list_ids))
  )
  SELECT i.et, i.eid FROM included i
  WHERE NOT EXISTS (SELECT 1 FROM suppressions s WHERE s.et = i.et AND s.eid = i.eid);
END $$;

-- Friendly-name wrapper — clients call this one
CREATE OR REPLACE FUNCTION list_effective_members_v(
  p_list_id uuid,
  p_honor_suppressions boolean DEFAULT true,
  p_suppression_list_ids uuid[] DEFAULT NULL
) RETURNS TABLE (entity_type list_entity_type, entity_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT m.out_entity_type, m.out_entity_id
  FROM list_effective_members(p_list_id, p_honor_suppressions, p_suppression_list_ids) m;
$$;

REVOKE EXECUTE ON FUNCTION list_effective_members_v(uuid, boolean, uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION list_effective_members_v(uuid, boolean, uuid[]) TO service_role;

CREATE OR REPLACE VIEW v_list_effective_members AS
SELECT l.id AS list_id, l.name AS list_name,
       m.out_entity_type AS entity_type, m.out_entity_id AS entity_id
FROM lists l
CROSS JOIN LATERAL list_effective_members(l.id, true, NULL) m
WHERE l.active AND l.kind <> 'suppression';

-- ------------------------------------------------------------
-- exec_list_filter: run compiled dynamic-list WHERE against whitelisted tables.
-- SECURITY: table whitelist; column names in where_sql originate only from the
-- list library's field whitelist; values pass as USING bindings; service_role only.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION exec_list_filter(
  p_table     text,
  p_where_sql text,
  p_params    jsonb
) RETURNS TABLE (id uuid)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_alias constant text := 't';
  v_sql   text;
  v_arr   text[];
  v_len   int;
BEGIN
  IF p_table NOT IN ('companies', 'contacts') THEN
    RAISE EXCEPTION 'exec_list_filter: table % not allowed', p_table;
  END IF;
  v_len := jsonb_array_length(coalesce(p_params, '[]'::jsonb));
  v_sql := format('SELECT %I.id FROM %I AS %I WHERE %s', v_alias, p_table, v_alias, p_where_sql);
  IF v_len = 0 THEN
    RETURN QUERY EXECUTE v_sql;
  ELSE
    SELECT array_agg(elem #>> '{}') INTO v_arr FROM jsonb_array_elements(p_params) elem;
    RETURN QUERY EXECUTE v_sql USING
      v_arr[1], v_arr[2], v_arr[3], v_arr[4], v_arr[5], v_arr[6], v_arr[7], v_arr[8],
      v_arr[9], v_arr[10], v_arr[11], v_arr[12], v_arr[13], v_arr[14], v_arr[15], v_arr[16],
      v_arr[17], v_arr[18], v_arr[19], v_arr[20], v_arr[21], v_arr[22], v_arr[23], v_arr[24],
      v_arr[25], v_arr[26], v_arr[27], v_arr[28], v_arr[29], v_arr[30], v_arr[31], v_arr[32];
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION exec_list_filter(text, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION exec_list_filter(text, text, jsonb) TO service_role;

-- ============================================================
-- LinkedIn monitoring tables (consumed via list_bindings)
-- ============================================================
CREATE TYPE linkedin_fetch_type AS ENUM (
  'company_page','company_posts','company_people','profile_public','profile_activity'
);
CREATE TYPE linkedin_signal_kind AS ENUM (
  'headline_change','headcount_change','about_change','new_post','new_position',
  'company_added','bio_update','website_change','other'
);

CREATE TABLE linkedin_monitor_configs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  list_binding_id    uuid REFERENCES list_bindings(id) ON DELETE CASCADE,
  fetch_types        linkedin_fetch_type[] NOT NULL DEFAULT ARRAY['company_page']::linkedin_fetch_type[],
  cadence_seconds    integer NOT NULL DEFAULT 21600,
  jitter_seconds     integer NOT NULL DEFAULT 1800,
  batch_size         integer NOT NULL DEFAULT 15,
  per_fetch_delay_ms integer NOT NULL DEFAULT 60000,
  active             boolean NOT NULL DEFAULT true,
  last_run_at        timestamptz,
  next_run_at        timestamptz DEFAULT now(),
  run_cursor         jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX linkedin_monitor_next_run_idx ON linkedin_monitor_configs (next_run_at) WHERE active;

CREATE TABLE linkedin_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       list_entity_type NOT NULL,
  entity_id         uuid NOT NULL,
  fetch_type        linkedin_fetch_type NOT NULL,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  source_url        text NOT NULL,
  http_status       integer,
  content_hash      text NOT NULL,
  parsed            jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_storage_path  text,
  firecrawl_job_id  text,
  monitor_config_id uuid REFERENCES linkedin_monitor_configs(id) ON DELETE SET NULL,
  error             text,
  meta              jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX linkedin_snapshots_entity_idx  ON linkedin_snapshots (entity_type, entity_id, fetched_at DESC);
CREATE INDEX linkedin_snapshots_hash_idx    ON linkedin_snapshots (entity_type, entity_id, fetch_type, content_hash);
CREATE INDEX linkedin_snapshots_monitor_idx ON linkedin_snapshots (monitor_config_id, fetched_at DESC);

CREATE TABLE linkedin_signals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       list_entity_type NOT NULL,
  entity_id         uuid NOT NULL,
  snapshot_id       uuid NOT NULL REFERENCES linkedin_snapshots(id) ON DELETE CASCADE,
  prior_snapshot_id uuid REFERENCES linkedin_snapshots(id) ON DELETE SET NULL,
  signal_kind       linkedin_signal_kind NOT NULL,
  before_value      jsonb,
  after_value       jsonb,
  detected_at       timestamptz NOT NULL DEFAULT now(),
  triaged           boolean NOT NULL DEFAULT false,
  triaged_at        timestamptz,
  triaged_by        text,
  activity_id       uuid REFERENCES activities(id) ON DELETE SET NULL,
  dismissed         boolean NOT NULL DEFAULT false,
  meta              jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX linkedin_signals_entity_idx ON linkedin_signals (entity_type, entity_id, detected_at DESC);
CREATE INDEX linkedin_signals_triage_idx ON linkedin_signals (triaged, dismissed, detected_at DESC)
  WHERE NOT triaged AND NOT dismissed;
CREATE INDEX linkedin_signals_kind_idx   ON linkedin_signals (signal_kind, detected_at DESC);

-- Add 'linkedin_signal' to activities.kind enum if it's an enum
DO $$
DECLARE v_typname text;
BEGIN
  SELECT t.typname INTO v_typname
  FROM pg_type t
  JOIN pg_attribute a ON a.atttypid = t.oid
  JOIN pg_class c ON c.oid = a.attrelid
  WHERE c.relname = 'activities' AND a.attname = 'kind' AND t.typtype = 'e';
  IF v_typname IS NOT NULL THEN
    BEGIN
      EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', v_typname, 'linkedin_signal');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE TRIGGER linkedin_monitor_configs_updated_at
  BEFORE UPDATE ON linkedin_monitor_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE linkedin_monitor_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_signals         ENABLE ROW LEVEL SECURITY;

CREATE POLICY li_monitor_service_all   ON linkedin_monitor_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY li_snapshots_service_all ON linkedin_snapshots       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY li_signals_service_all   ON linkedin_signals         FOR ALL TO service_role USING (true) WITH CHECK (true);
