# PREPARED, NOT RUN. PostgreSQL isolationtester specification, NOT a SQL script.
# Requires a future separately authorized COMMITTED disposable P8R1 schema.
# Run only once in a fresh clone, as owner, READ COMMITTED. Discard clone afterward.
# No production credentials; no teardown because events deliberately reject deletes.
setup
{
  DO $guard$ BEGIN
    IF left(current_database(),13) <> 'idn_p8r_test_'
       OR current_setting('idn.p8r.execution_permission',true)
            IS DISTINCT FROM 'APPROVED_DISPOSABLE_REHEARSAL_P8R1' THEN
      RAISE EXCEPTION 'Disposable concurrency fixture authorization missing';
    END IF;
  END $guard$;
  INSERT INTO public.contact(id,email)
    VALUES('88888888-8888-4888-8888-888888888801','p8r-concurrent@example.invalid');
  INSERT INTO public.campaign_send(id,contact_id) VALUES
    ('88888888-8888-4888-8888-888888888811','88888888-8888-4888-8888-888888888801'),
    ('88888888-8888-4888-8888-888888888812','88888888-8888-4888-8888-888888888801');
}
session "a"
step "a_begin" { BEGIN ISOLATION LEVEL READ COMMITTED; }
step "a_event" {
  SELECT public.record_campaign_send_event('88888888-8888-4888-8888-888888888811',
    'opened','2026-01-01T00:00:00Z','fixture','same');
  SELECT public.record_campaign_send_event('88888888-8888-4888-8888-888888888811',
    'delivered','2026-01-02T00:00:00Z','fixture','delivery-2');
  SELECT public.record_campaign_send_event('88888888-8888-4888-8888-888888888811',
    'clicked','2026-01-03T00:00:00Z','fixture','z','https://example.invalid/z');
}
step "a_commit" { COMMIT; }
session "b"
step "b_begin" { BEGIN ISOLATION LEVEL READ COMMITTED; }
step "b_duplicate" {
  SELECT public.record_campaign_send_event('88888888-8888-4888-8888-888888888811',
    'opened','2026-01-01T00:00:00Z','fixture','same');
}
step "b_other" {
  SELECT public.record_campaign_send_event('88888888-8888-4888-8888-888888888812',
    'opened','2026-01-02T00:00:00Z','fixture','other');
  SELECT public.record_campaign_send_event('88888888-8888-4888-8888-888888888811',
    'delivered','2026-01-01T00:00:00Z','fixture','delivery-1');
  SELECT public.record_campaign_send_event('88888888-8888-4888-8888-888888888812',
    'delivered','2026-01-02T00:00:00Z','fixture','delivery-other');
  SELECT public.record_campaign_send_event('88888888-8888-4888-8888-888888888811',
    'clicked','2026-01-03T00:00:00Z','fixture','a','https://example.invalid/a');
}
step "b_commit" { COMMIT; }
step "verify" {
  DO $verify$ BEGIN
    IF (SELECT emails_opened FROM public.contact WHERE id='88888888-8888-4888-8888-888888888801')<>2
       OR (SELECT emails_delivered FROM public.contact WHERE id='88888888-8888-4888-8888-888888888801')<>2
       OR (SELECT emails_clicked FROM public.contact WHERE id='88888888-8888-4888-8888-888888888801')<>2
       OR (SELECT count(*) FROM public.campaign_send_event WHERE event_source='fixture'
           AND send_id IN ('88888888-8888-4888-8888-888888888811','88888888-8888-4888-8888-888888888812'))<>7
       OR (SELECT delivered_at FROM public.campaign_send WHERE id='88888888-8888-4888-8888-888888888811')
           IS DISTINCT FROM '2026-01-01T00:00:00Z'::timestamptz
       OR (SELECT last_clicked_url FROM public.campaign_send WHERE id='88888888-8888-4888-8888-888888888811')
           IS DISTINCT FROM 'https://example.invalid/z'
       OR EXISTS(SELECT 1 FROM public.campaign_send WHERE id IN
          ('88888888-8888-4888-8888-888888888811','88888888-8888-4888-8888-888888888812') AND opens<>1) THEN
      RAISE EXCEPTION 'Concurrent dedup/contact aggregate failed';
    END IF;
  END $verify$;
}
# Run this spec alone in its own fresh database; setup IDs intentionally collide on rerun.
permutation "a_begin" "a_event" "b_begin" "b_other" "a_commit" "b_duplicate" "b_commit" "verify"
