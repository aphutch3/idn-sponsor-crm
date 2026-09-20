-- P8R1: auditable proposals, never automatic restoration from guessed source SQL.
SELECT pg_temp.p8r_guard();
CREATE SCHEMA migration_review;
REVOKE ALL ON SCHEMA migration_review FROM PUBLIC;
CREATE TABLE migration_review.phase8_field (
  entity_table text NOT NULL, column_name text NOT NULL, value_type text NOT NULL,
  PRIMARY KEY(entity_table,column_name),
  CHECK(entity_table IN ('company','contact','list')),
  CHECK(value_type IN ('text','integer','numeric','boolean','text[]','jsonb','timestamptz'))
);
INSERT INTO migration_review.phase8_field VALUES
 ('company','sponsor_tier','text'),('company','sponsor_tier_rank','integer'),
 ('company','group','text'),('company','subcategory','text'),
 ('company','summit_interest','text[]'),('company','rank_history','jsonb'),
 ('company','rank_last_year','integer'),('company','rank_frequency','text'),
 ('company','number_of_employees','integer'),('company','keep','boolean'),
 ('company','rank_stage','text'),('company','startup','boolean'),
 ('company','marketing_budget','numeric'),('company','total_revenue','numeric'),
 ('company','conferences','text[]'),('company','conference_speaking','text[]'),
 ('company','blockers_count','integer'),('company','activity','text[]'),
 ('company','company_owner','text'),
 ('contact','key_contact','text[]'),('contact','unsubscribed_all_email','boolean'),
 ('contact','last_email_open_date','timestamptz'),('contact','last_email_click_date','timestamptz'),
 ('list','entity_types','text[]');

CREATE TABLE migration_review.phase8_candidate (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_table text NOT NULL, entity_id uuid NOT NULL, column_name text NOT NULL,
  before_value jsonb NOT NULL, source_present boolean NOT NULL,
  raw_source jsonb NOT NULL, proposed_value jsonb,
  source_fingerprint text NOT NULL,
  source_description text NOT NULL DEFAULT 'Preserved Engager compatibility/staging field through external_ref',
  conversion_error text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','blocked','approved','retained','applied')),
  reviewed_by text, reviewed_at timestamptz, reason text, applied_at timestamptz,
  UNIQUE(entity_table,entity_id,column_name),
  FOREIGN KEY(entity_table,column_name) REFERENCES migration_review.phase8_field,
  CHECK(status IN ('pending','blocked') OR
        (nullif(btrim(reviewed_by),'') IS NOT NULL AND reviewed_at IS NOT NULL AND nullif(btrim(reason),'') IS NOT NULL)),
  CHECK(status NOT IN ('approved','applied') OR (proposed_value IS NOT NULL AND conversion_error IS NULL)),
  CHECK((status='applied') = (applied_at IS NOT NULL))
);
COMMENT ON TABLE migration_review.phase8_candidate IS
 'P8R1 proposed field-level changes, source values, reviewer decision and applied audit; owner-only until role review.';

CREATE FUNCTION migration_review.p8r_convert(v jsonb,t text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog AS $body$
DECLARE s text; n numeric; a jsonb;
BEGIN
  IF v IS NULL OR v='null'::jsonb THEN RETURN 'null'::jsonb; END IF;
  s := v #>> '{}';
  IF t='jsonb' THEN RETURN v;
  ELSIF t='text' THEN
    IF jsonb_typeof(v) NOT IN ('string','number','boolean') THEN
      RAISE EXCEPTION 'Scalar text expected'; END IF;
    RETURN to_jsonb(s);
  ELSIF t IN ('integer','numeric') THEN
    IF jsonb_typeof(v) NOT IN ('string','number') THEN RAISE EXCEPTION 'Numeric scalar required'; END IF;
    IF btrim(s)='' THEN RETURN 'null'::jsonb; END IF;
    IF s !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' THEN RAISE EXCEPTION 'Ambiguous numeric representation'; END IF;
    n := s::numeric;
    IF t='integer' THEN
      IF trunc(n)<>n THEN RAISE EXCEPTION 'Fractional integer rejected'; END IF;
      RETURN to_jsonb(n::integer);
    END IF;
    RETURN to_jsonb(n);
  ELSIF t='boolean' THEN
    IF s NOT IN ('true','false') THEN RAISE EXCEPTION 'Only explicit true/false accepted'; END IF;
    RETURN to_jsonb(s::boolean);
  ELSIF t='text[]' THEN
    IF jsonb_typeof(v)='array' THEN a:=v;
    ELSIF jsonb_typeof(v)='string' THEN
      IF btrim(s)='' THEN RETURN 'null'::jsonb; END IF;
      IF ltrim(s) LIKE '[%' THEN a:=s::jsonb; ELSE a:=jsonb_build_array(s); END IF;
    ELSE RAISE EXCEPTION 'Array or text required'; END IF;
    IF jsonb_typeof(a)<>'array'
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(a) x WHERE jsonb_typeof(x)<>'string') THEN
      RAISE EXCEPTION 'Array must contain strings only';
    END IF;
    RETURN a;
  ELSIF t='timestamptz' THEN
    IF jsonb_typeof(v)<>'string' OR s !~ '[T ][0-9]{2}:[0-9]{2}.*(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN
      RAISE EXCEPTION 'Explicit timezone required';
    END IF;
    RETURN to_jsonb(s::timestamptz);
  END IF;
  RAISE EXCEPTION 'Unsupported value type %',t;
END $body$;

CREATE FUNCTION migration_review.p8r_source_record(e text,k uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $body$
DECLARE result jsonb;
BEGIN
  IF e='company' THEN
    SELECT coalesce(to_jsonb(s),'{}'::jsonb)||to_jsonb(v)||
           CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('rank_history',to_jsonb(s)->'rank_history')
                ELSE '{}'::jsonb END INTO result
    FROM public.companies v LEFT JOIN public.external_ref er
      ON er.entity_table='company' AND er.entity_id=v.id AND er.source_system='engager_v1'
    LEFT JOIN stg_engager.companies s ON s.id::text=er.external_id WHERE v.id=k;
  ELSIF e='contact' THEN
    SELECT to_jsonb(v)||jsonb_build_object('unsubscribed_all_email',
      v.unsubscribed_all OR coalesce(v.unsubscribed_all_email,false))
    INTO result FROM public.contacts v WHERE v.id=k;
  ELSIF e='list' THEN
    SELECT to_jsonb(v) INTO result FROM public.lists v WHERE v.id=k;
  ELSE RAISE EXCEPTION 'Unsupported source entity'; END IF;
  RETURN result;
END $body$;

-- Generates proposals once, inside the isolated rehearsal only. Source ambiguity
-- and invalid conversions are retained as blocked items, not silently defaulted.
CREATE FUNCTION migration_review.p8r_propose() RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $body$
DECLARE f record; target record; src jsonb; raw_value jsonb; v jsonb; err text;
        old_value jsonb; present boolean; total integer:=0;
BEGIN
  PERFORM pg_temp.p8r_guard();
  IF EXISTS(SELECT 1 FROM migration_review.phase8_candidate) THEN
    RAISE EXCEPTION 'Existing proposal batch must not be silently regenerated'; END IF;
  FOR f IN SELECT * FROM migration_review.phase8_field ORDER BY entity_table,column_name LOOP
    FOR target IN EXECUTE format('SELECT id,to_jsonb(t) AS data FROM public.%I t ORDER BY id',f.entity_table) LOOP
      src:=NULL; present:=false; raw_value:='null'::jsonb;
      old_value := coalesce(target.data->f.column_name,'null'::jsonb);
      v:=NULL; err:=NULL;
      BEGIN
        src := migration_review.p8r_source_record(f.entity_table,target.id);
        present := coalesce(src ? f.column_name,false);
        raw_value := coalesce(src->f.column_name,'null'::jsonb);
        IF NOT present THEN RAISE EXCEPTION 'Source field absent; do not invent history'; END IF;
        v := migration_review.p8r_convert(raw_value,f.value_type);
        -- Suppression is monotonic; dates never erase later target evidence.
        IF f.entity_table='contact' AND f.column_name='unsubscribed_all_email' THEN
          v:=to_jsonb(coalesce((old_value#>>'{}')::boolean,false) OR
                     coalesce((v#>>'{}')::boolean,false));
        ELSIF f.value_type='timestamptz' THEN
          v:=coalesce(to_jsonb(greatest((old_value#>>'{}')::timestamptz,
                                      (v#>>'{}')::timestamptz)),'null'::jsonb);
        END IF;
        IF v='null'::jsonb AND EXISTS(
          SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name=f.entity_table AND column_name=f.column_name AND is_nullable='NO'
        ) THEN RAISE EXCEPTION 'NULL source would violate target NOT NULL'; END IF;
      EXCEPTION WHEN OTHERS THEN err:=SQLSTATE||': '||SQLERRM; END;
      INSERT INTO migration_review.phase8_candidate(
        entity_table,entity_id,column_name,before_value,source_present,raw_source,
        proposed_value,source_fingerprint,conversion_error,status)
      VALUES(f.entity_table,target.id,f.column_name,old_value,present,raw_value,v,
        md5(jsonb_build_array(present,raw_value)::text),err,
        CASE WHEN err IS NULL THEN 'pending' ELSE 'blocked' END);
      total:=total+1;
    END LOOP;
  END LOOP;
  RETURN total;
END $body$;

CREATE FUNCTION migration_review.p8r_apply_approved() RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $body$
DECLARE r record; actual jsonb; src jsonb; fingerprint text; changed integer; total integer:=0;
        checked_value jsonb; field_type text;
BEGIN
  PERFORM pg_temp.p8r_guard();
  -- Freeze staging sources and tag-derived fallbacks until transaction end.
  LOCK TABLE stg_engager.companies, stg_engager.contacts, stg_engager.lists IN SHARE MODE;
  LOCK TABLE public.entity_tag, public.tag IN SHARE MODE;
  -- Any unresolved item blocks the entire batch; operator must review even no-ops.
  IF EXISTS(SELECT 1 FROM migration_review.phase8_candidate WHERE status IN ('pending','blocked')) THEN
    RAISE EXCEPTION 'Unreviewed or blocked candidates remain';
  END IF;
  FOR r IN SELECT * FROM migration_review.phase8_candidate
           WHERE status='approved' ORDER BY entity_table,entity_id,column_name FOR UPDATE LOOP
    EXECUTE format('SELECT to_jsonb(t)->%L FROM public.%I t WHERE id=$1 FOR NO KEY UPDATE',
                   r.column_name,r.entity_table) INTO actual USING r.entity_id;
    IF actual IS DISTINCT FROM r.before_value THEN
      RAISE EXCEPTION 'Stale target candidate %',r.id; END IF;
    src:=migration_review.p8r_source_record(r.entity_table,r.entity_id);
    fingerprint:=md5(jsonb_build_array(coalesce(src ? r.column_name,false),
                          coalesce(src->r.column_name,'null'::jsonb))::text);
    IF fingerprint<>r.source_fingerprint THEN RAISE EXCEPTION 'Stale source candidate %',r.id; END IF;
    SELECT value_type INTO STRICT field_type FROM migration_review.phase8_field
      WHERE entity_table=r.entity_table AND column_name=r.column_name;
    checked_value:=migration_review.p8r_convert(r.proposed_value,field_type);
    IF checked_value IS DISTINCT FROM r.proposed_value THEN
      RAISE EXCEPTION 'Approved value must already have canonical JSON type'; END IF;
    IF field_type='timestamptz' AND actual<>'null'::jsonb
       AND (r.proposed_value='null'::jsonb OR
            (r.proposed_value#>>'{}')::timestamptz < (actual#>>'{}')::timestamptz) THEN
      RAISE EXCEPTION 'Reviewed timestamp cannot erase or move target evidence backward'; END IF;
    IF r.entity_table='contact' AND r.column_name='unsubscribed_all_email'
       AND (actual='true'::jsonb OR EXISTS(SELECT 1 FROM public.contact WHERE id=r.entity_id AND unsubscribed_all))
       AND r.proposed_value IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION 'Suppression cannot be cleared by reconstruction'; END IF;
    EXECUTE format(
      'UPDATE public.%I t SET %I = p.%I FROM jsonb_populate_record(NULL::public.%I,$1) p WHERE t.id=$2',
      r.entity_table,r.column_name,r.column_name,r.entity_table)
    USING jsonb_build_object(r.column_name,r.proposed_value),r.entity_id;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN RAISE EXCEPTION 'Expected one target row'; END IF;
    UPDATE migration_review.phase8_candidate SET status='applied',applied_at=clock_timestamp() WHERE id=r.id;
    total:=total+1;
  END LOOP;
  RETURN total;
END $body$;
REVOKE ALL ON ALL TABLES IN SCHEMA migration_review FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA migration_review FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA migration_review FROM PUBLIC;
-- No call to p8r_propose() or p8r_apply_approved() occurs here.
-- No grants or approvals are populated on behalf of a reviewer.
