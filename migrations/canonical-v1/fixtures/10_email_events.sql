-- PREPARED ONLY. Run after 00..50 in the SAME authorized transaction.
-- This fixture creates only synthetic data and rolls it back to its savepoint.
SELECT pg_temp.p8r_guard();
SAVEPOINT email_fixture;
DO $fixture$
DECLARE c uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid();
        first_id uuid; duplicate_id uuid; actual public.campaign_send; recipient public.contact;
BEGIN
  INSERT INTO public.contact(id,email) VALUES(c,('p8r-'||c||'@example.invalid')::public.citext);
  INSERT INTO public.campaign_send(id,contact_id) VALUES(s,c),(s2,c);
  -- Actual timestamps intentionally arrive out of order.
  first_id:=public.record_campaign_send_event(s,'opened','2026-01-02T00:00:00Z','fixture','open-2');
  duplicate_id:=public.record_campaign_send_event(s,'opened','2026-01-02T00:00:00Z','fixture','open-2');
  IF first_id<>duplicate_id THEN RAISE EXCEPTION 'Duplicate ID changed'; END IF;
  PERFORM public.record_campaign_send_event(s,'opened','2026-01-01T00:00:00Z','fixture','open-1');
  PERFORM public.record_campaign_send_event(s,'clicked','2026-01-03T00:00:00Z','fixture','z','https://example.invalid/z');
  PERFORM public.record_campaign_send_event(s,'clicked','2026-01-03T00:00:00Z','fixture','a','https://example.invalid/a');
  PERFORM public.record_campaign_send_event(s,'clicked','2026-01-01T00:00:00Z','fixture','old','https://example.invalid/old');
  PERFORM public.record_campaign_send_event(s,'delivered','2026-01-02T00:00:00Z','fixture','delivery-2');
  PERFORM public.record_campaign_send_event(s,'delivered','2026-01-01T00:00:00Z','fixture','delivery-1');
  PERFORM public.record_campaign_send_event(s2,'delivered','2026-01-04T00:00:00Z','fixture','delivery-other');
  PERFORM public.record_campaign_send_event(s,'failed','2026-01-05T00:00:00Z','fixture','failed');
  PERFORM public.record_campaign_send_event(s,'bounced','2026-01-06T00:00:00Z','fixture','bounce');
  PERFORM public.record_campaign_send_event(s,'complaint','2026-01-07T00:00:00Z','fixture','complaint');
  PERFORM public.record_campaign_send_event(s,'unsubscribed','2026-01-08T00:00:00Z','fixture','unsub');
  PERFORM public.record_campaign_send_event(s,'sent','2025-12-31T00:00:00Z','fixture','sent-late');
  PERFORM public.record_campaign_send_event(s2,'sent','2026-01-03T00:00:00Z','fixture','sent-other');
  SELECT * INTO STRICT actual FROM public.campaign_send WHERE id=s;
  IF actual.status<>'complaint' OR actual.opens<>2 OR actual.clicks<>3
     OR actual.first_opened_at IS DISTINCT FROM '2026-01-01T00:00:00Z'::timestamptz
     OR actual.last_opened_at IS DISTINCT FROM '2026-01-02T00:00:00Z'::timestamptz
     OR actual.opened_at IS DISTINCT FROM actual.first_opened_at
     OR actual.clicked_at IS DISTINCT FROM actual.first_clicked_at
     OR actual.first_clicked_at IS DISTINCT FROM '2026-01-01T00:00:00Z'::timestamptz
     OR actual.last_clicked_at IS DISTINCT FROM '2026-01-03T00:00:00Z'::timestamptz
     OR actual.last_clicked_url IS DISTINCT FROM 'https://example.invalid/z'
     OR actual.delivered_at IS DISTINCT FROM '2026-01-01T00:00:00Z'::timestamptz
     OR actual.last_event_at IS DISTINCT FROM '2026-01-08T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Send rollup mismatch';
  END IF;
  SELECT * INTO STRICT recipient FROM public.contact WHERE id=c;
  IF recipient.emails_delivered<>2 OR recipient.emails_opened<>2 OR recipient.emails_clicked<>3
     OR NOT recipient.unsubscribed_all OR NOT recipient.unsubscribed_all_email
     OR recipient.last_email_send_date IS DISTINCT FROM '2026-01-03T00:00:00Z'::timestamptz
     OR recipient.last_email_open_date IS DISTINCT FROM '2026-01-02T00:00:00Z'::timestamptz
     OR recipient.last_email_click_date IS DISTINCT FROM '2026-01-03T00:00:00Z'::timestamptz
     OR recipient.last_activity_date IS DISTINCT FROM '2026-01-08T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Contact rollup mismatch';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.campaign_send_event WHERE send_id=s AND event_kind='complained') THEN
    RAISE EXCEPTION 'Complaint alias not normalized';
  END IF;
  BEGIN
    PERFORM public.record_campaign_send_event(s,'opened','2026-01-09T00:00:00Z','fixture','open-2');
    RAISE EXCEPTION 'Conflicting duplicate accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.record_campaign_send_event(s,'unknown','2026-01-09T00:00:00Z','fixture','invalid');
    RAISE EXCEPTION 'Invalid kind accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.campaign_send_event SET url='https://example.invalid/altered' WHERE id=first_id;
    RAISE EXCEPTION 'Event mutation accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN
    DELETE FROM public.campaign_send WHERE id=s;
    RAISE EXCEPTION 'Event-bearing cascade deletion accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN
    UPDATE public.campaign_send SET contact_id=NULL WHERE id=s;
    RAISE EXCEPTION 'Recipient reassignment accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
END $fixture$;
ROLLBACK TO SAVEPOINT email_fixture;
RELEASE SAVEPOINT email_fixture;
