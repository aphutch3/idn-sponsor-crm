-- ============================================================
-- 0002 · List Manager: reusable polymorphic lists + suppression + bindings
-- ============================================================
-- Applied to Supabase project wpgfanjopuupjcgrdbmb on 2026-09-07.
-- Kept here as source-of-truth for future environments.

CREATE TYPE list_entity_type AS ENUM ('company', 'contact');
CREATE TYPE list_kind AS ENUM ('static', 'dynamic', 'hybrid', 'suppression');
CREATE TYPE list_member_role AS ENUM ('include', 'exclude');
CREATE TYPE list_member_source AS ENUM ('manual', 'dynamic_snapshot', 'import', 'extension', 'api');
CREATE TYPE list_refresh_cadence AS ENUM ('manual', 'hourly', 'daily', 'on_read');

CREATE TABLE lists (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text UNIQUE,
  description      text,
  kind             list_kind NOT NULL DEFAULT 'static',
  entity_types     list_entity_type[] NOT NULL DEFAULT ARRAY['company']::list_entity_type[],
  purpose          text,
  tags             text[] NOT NULL DEFAULT ARRAY[]::text[],
  owner            text,
  visibility       text NOT NULL DEFAULT 'team' CHECK (visibility IN ('private','team','public')),
  pinned           boolean NOT NULL DEFAULT false,
  active           boolean NOT NULL DEFAULT true,
  member_count     integer NOT NULL DEFAULT 0,
  last_refreshed_at timestamptz,
  meta             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lists_entity_types_nonempty CHECK (array_length(entity_types, 1) >= 1)
);
CREATE INDEX lists_purpose_idx  ON lists (purpose) WHERE active;
CREATE INDEX lists_kind_idx     ON lists (kind)    WHERE active;
CREATE INDEX lists_pinned_idx   ON lists (pinned)  WHERE pinned;
CREATE INDEX lists_tags_gin_idx ON lists USING gin (tags);

CREATE TABLE list_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id      uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  entity_type  list_entity_type NOT NULL,
  entity_id    uuid NOT NULL,
  role         list_member_role NOT NULL DEFAULT 'include',
  source       list_member_source NOT NULL DEFAULT 'manual',
  added_at     timestamptz NOT NULL DEFAULT now(),
  added_by     text,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (list_id, entity_type, entity_id)
);
CREATE INDEX list_members_list_idx   ON list_members (list_id, role);
CREATE INDEX list_members_entity_idx ON list_members (entity_type, entity_id);

CREATE TABLE list_filters (
  list_id             uuid PRIMARY KEY REFERENCES lists(id) ON DELETE CASCADE,
  filter_json         jsonb NOT NULL,
  refresh_cadence     list_refresh_cadence NOT NULL DEFAULT 'daily',
  last_refreshed_at   timestamptz,
  last_member_count   integer,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE list_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id       uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  version_num   integer NOT NULL,
  member_ids    jsonb NOT NULL,
  member_count  integer NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text,
  UNIQUE (list_id, version_num)
);
CREATE INDEX list_versions_list_idx ON list_versions (list_id, version_num DESC);

CREATE TABLE list_bindings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id               uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  binding_type          text NOT NULL,
  binding_ref_id        uuid,
  honor_suppressions    boolean NOT NULL DEFAULT true,
  suppression_list_ids  uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  active                boolean NOT NULL DEFAULT true,
  config                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, binding_type, binding_ref_id)
);
CREATE INDEX list_bindings_type_idx ON list_bindings (binding_type) WHERE active;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER lists_updated_at         BEFORE UPDATE ON lists         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER list_filters_updated_at  BEFORE UPDATE ON list_filters  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER list_bindings_updated_at BEFORE UPDATE ON list_bindings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE lists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_filters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY lists_service_all         ON lists         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY list_members_service_all  ON list_members  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY list_filters_service_all  ON list_filters  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY list_versions_service_all ON list_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY list_bindings_service_all ON list_bindings FOR ALL TO service_role USING (true) WITH CHECK (true);
