-- Prepared postflight assertions, NOT proof until run in an authorized rehearsal.
SELECT pg_temp.p8r_guard();
DO $checks$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['campaign_send_event','linkedin_signal','list_filter','list_version'] LOOP
    IF to_regclass('public.'||v) IS NULL THEN RAISE EXCEPTION 'Missing table %',v; END IF;
  END LOOP;
  FOREACH v IN ARRAY ARRAY['campaign_sends','segment','segments','v_company','v_contact','v_key_contacts','v_taxonomy','companies','contacts','lists'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v AND c.relkind='v') THEN
      RAISE EXCEPTION 'Missing view %',v; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='campaign_send' AND column_name='status' AND udt_name='text')
     OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='campaign_send' AND column_name='campaign_id' AND is_nullable='YES')
     OR to_regtype('public.send_status') IS NOT NULL
     OR to_regprocedure('public.update_campaign_send_rollups()') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected status, campaign nullability, or legacy rollup contract'; END IF;
  IF (SELECT count(*) FROM migration_review.phase8_field)<>24 THEN
    RAISE EXCEPTION 'Backfill allowlist mismatch'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
      ('p8r_event_rollup','p8r_event_immutable','p8r_send_recipient_immutable',
       'p8r_monitor_updated','p8r_binding_updated','p8r_filter_updated'))<>6 THEN
    RAISE EXCEPTION 'Expected six corrective/timestamp triggers'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.campaign_send'::regclass
       AND confrelid='public.campaign'::regclass AND contype='f')
     OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.campaign_send_event'::regclass
       AND conname='p8r_event_dedup' AND contype='u') THEN
    RAISE EXCEPTION 'Campaign FK or dedup constraint absent'; END IF;
  IF EXISTS(SELECT 1 FROM public.campaign_send
     WHERE opens<0 OR clicks<0 OR first_opened_at>last_opened_at OR first_clicked_at>last_clicked_at
        OR opened_at IS DISTINCT FROM first_opened_at OR clicked_at IS DISTINCT FROM first_clicked_at) THEN
    RAISE EXCEPTION 'Send rollup bounds/legacy aliases disagree'; END IF;
  -- Contact counters may include separately reviewed historical baselines.
  -- Do not assert equality with the initially empty event ledger.
END $checks$;
