-- PREPARED ONLY. Run before creating a real proposal batch; no fixture data retained.
SELECT pg_temp.p8r_guard();
SAVEPOINT backfill_fixture;
DO $fixture$
DECLARE k uuid:=gen_random_uuid(); src jsonb; raw_value jsonb; present boolean;
        candidate bigint; rejected boolean; count_applied integer; sample jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM migration_review.phase8_candidate) THEN
    RAISE EXCEPTION 'Fixture requires an empty proposal table'; END IF;
  IF migration_review.p8r_convert('"42"','integer')<>'42'::jsonb
     OR migration_review.p8r_convert('"true"','boolean')<>'true'::jsonb
     OR migration_review.p8r_convert('"company"','text[]')<>'["company"]'::jsonb
     OR migration_review.p8r_convert(to_jsonb('["company"]'::text),'text[]')<>'["company"]'::jsonb
     OR migration_review.p8r_convert('null','text[]')<>'null'::jsonb THEN
    RAISE EXCEPTION 'Valid conversion mismatch'; END IF;
  FOR sample IN SELECT x FROM jsonb_array_elements('["1.5","1,000","1e3",true,{}, "2147483648"]'::jsonb) x LOOP
    rejected:=false;
    BEGIN PERFORM migration_review.p8r_convert(sample,'integer');
    EXCEPTION WHEN OTHERS THEN rejected:=true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'Unsafe integer accepted: %',sample; END IF;
  END LOOP;
  rejected:=false;
  BEGIN PERFORM migration_review.p8r_convert('"2026-01-01 00:00:00"','timestamptz');
  EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Timezone-free date accepted'; END IF;
  rejected:=false;
  BEGIN PERFORM migration_review.p8r_convert('["company",null]','text[]');
  EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Mixed/null array accepted'; END IF;

  INSERT INTO public.list(id,name) VALUES(k,'P8R fixture '||k);
  src:=migration_review.p8r_source_record('list',k);
  present:=coalesce(src ? 'entity_types',false);
  raw_value:=coalesce(src->'entity_types','null'::jsonb);
  -- Deliberately fabricated reviewer override; never a real backfill/source rule.
  INSERT INTO migration_review.phase8_candidate(entity_table,entity_id,column_name,before_value,
    source_present,raw_source,proposed_value,source_fingerprint,source_description)
  VALUES('list',k,'entity_types','[]',present,raw_value,'["company"]',
    md5(jsonb_build_array(present,raw_value)::text),'Synthetic fixture only')
  RETURNING id INTO candidate;
  rejected:=false;
  BEGIN PERFORM migration_review.p8r_apply_approved();
  EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM LIKE 'Unreviewed%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Pending proposal did not block apply'; END IF;
  BEGIN
    UPDATE migration_review.phase8_candidate SET status='approved' WHERE id=candidate;
    RAISE EXCEPTION 'Missing reviewer metadata accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE migration_review.phase8_candidate SET status='approved',
    reviewed_by='SYNTHETIC-FIXTURE',reviewed_at=clock_timestamp(),reason='Fixture-only corrected value'
    WHERE id=candidate;
  UPDATE public.list SET entity_types=ARRAY['person'] WHERE id=k;
  rejected:=false;
  BEGIN PERFORM migration_review.p8r_apply_approved();
  EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM LIKE 'Stale target%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Stale target was not rejected'; END IF;
  UPDATE public.list SET entity_types=ARRAY[]::text[] WHERE id=k;
  UPDATE migration_review.phase8_candidate SET source_fingerprint='intentionally-stale' WHERE id=candidate;
  rejected:=false;
  BEGIN PERFORM migration_review.p8r_apply_approved();
  EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM LIKE 'Stale source%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Stale source was not rejected'; END IF;
  UPDATE migration_review.phase8_candidate SET source_fingerprint=md5(jsonb_build_array(present,raw_value)::text)
    WHERE id=candidate;
  count_applied:=migration_review.p8r_apply_approved();
  IF count_applied<>1 OR NOT EXISTS(SELECT 1 FROM public.list WHERE id=k AND entity_types=ARRAY['company'])
     OR NOT EXISTS(SELECT 1 FROM migration_review.phase8_candidate WHERE id=candidate AND status='applied' AND applied_at IS NOT NULL)
     OR migration_review.p8r_apply_approved()<>0 THEN
    RAISE EXCEPTION 'Reviewed apply or no-op repeat mismatch'; END IF;
END $fixture$;
ROLLBACK TO SAVEPOINT backfill_fixture;
RELEASE SAVEPOINT backfill_fixture;
