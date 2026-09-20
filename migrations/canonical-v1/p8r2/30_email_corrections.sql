-- P8R1: new corrective proposal, not recovered historical source. NOT APPLIED.
SELECT pg_temp.p8r_guard();
SET LOCAL search_path = public, pg_catalog;

-- Deliberate review decision: retain text + CHECK rather than change the type
-- beneath campaign_sends and destroy/recreate compatibility dependencies.
ALTER TABLE public.campaign_send
  ADD CONSTRAINT p8r_send_status_check
    CHECK (status IN ('queued','sent','delivered','bounced','complaint','failed')),
  ADD CONSTRAINT p8r_send_counts_check CHECK (opens >= 0 AND clicks >= 0);
ALTER TABLE public.campaign_send ALTER COLUMN campaign_id DROP NOT NULL;
COMMENT ON COLUMN public.campaign_send.campaign_id IS
 'P8R1: optional campaign for a one-off send; original FK is retained.';

ALTER TABLE public.campaign_send_event
  ADD COLUMN event_source text NOT NULL DEFAULT 'tracking',
  ADD COLUMN event_key text NOT NULL DEFAULT gen_random_uuid()::text,
  ADD CONSTRAINT p8r_event_key_check
    CHECK (btrim(event_source)<>'' AND btrim(event_key)<>''),
  ADD CONSTRAINT p8r_event_dedup UNIQUE(send_id,event_source,event_key);
COMMENT ON COLUMN public.campaign_send_event.event_source IS
 'Event provenance namespace. Tracking uses a unique key per request; providers must supply stable delivery IDs.';
COMMENT ON COLUMN public.campaign_send_event.event_key IS
 'Idempotency key scoped to send and source. A provider message ID is NOT an event ID.';

CREATE FUNCTION public.p8r_status_rank(value text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $body$
 SELECT CASE value WHEN 'queued' THEN 0 WHEN 'sent' THEN 10 WHEN 'failed' THEN 20
   WHEN 'delivered' THEN 30 WHEN 'bounced' THEN 40 WHEN 'complaint' THEN 50 ELSE -1 END
$body$;

CREATE FUNCTION public.p8r_lock_send(p_send uuid) RETURNS public.campaign_send
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $body$
DECLARE r public.campaign_send; recipient uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'P8R1 event ingestion requires READ COMMITTED';
  END IF;
  SELECT contact_id INTO recipient FROM public.campaign_send WHERE id=p_send;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown send %',p_send USING ERRCODE='23503'; END IF;
  -- Across sends for one contact, always lock contact before send.
  -- NO KEY UPDATE is compatible with the FK KEY SHARE taken on event insertion.
  IF recipient IS NOT NULL THEN
    PERFORM 1 FROM public.contact WHERE id=recipient FOR NO KEY UPDATE;
  END IF;
  SELECT * INTO r FROM public.campaign_send WHERE id=p_send FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Send disappeared' USING ERRCODE='40001'; END IF;
  IF r.contact_id IS DISTINCT FROM recipient THEN
    RAISE EXCEPTION 'Recipient changed during ingestion; retry' USING ERRCODE='40001';
  END IF;
  RETURN r;
END $body$;

CREATE FUNCTION public.p8r_rollup_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $body$
DECLARE s public.campaign_send; next_status text; delivery_increment integer := 0;
BEGIN
  s := public.p8r_lock_send(NEW.send_id);
  next_status := CASE NEW.event_kind
    WHEN 'complained' THEN 'complaint'
    WHEN 'sent' THEN 'sent' WHEN 'delivered' THEN 'delivered'
    WHEN 'bounced' THEN 'bounced' WHEN 'failed' THEN 'failed' ELSE s.status END;
  IF NEW.event_kind='delivered' AND s.delivered_at IS NULL THEN delivery_increment:=1; END IF;
  UPDATE public.campaign_send SET
    status = CASE WHEN public.p8r_status_rank(next_status)>public.p8r_status_rank(status)
                  THEN next_status ELSE status END,
    sent_at = CASE WHEN NEW.event_kind='sent' THEN least(sent_at,NEW.occurred_at) ELSE sent_at END,
    delivered_at = CASE WHEN NEW.event_kind='delivered' THEN least(delivered_at,NEW.occurred_at) ELSE delivered_at END,
    bounced_at = CASE WHEN NEW.event_kind='bounced' THEN least(bounced_at,NEW.occurred_at) ELSE bounced_at END,
    complained_at = CASE WHEN NEW.event_kind='complained' THEN least(complained_at,NEW.occurred_at) ELSE complained_at END,
    opens = opens + CASE WHEN NEW.event_kind='opened' THEN 1 ELSE 0 END,
    clicks = clicks + CASE WHEN NEW.event_kind='clicked' THEN 1 ELSE 0 END,
    opened_at = CASE WHEN NEW.event_kind='opened' THEN least(opened_at,NEW.occurred_at) ELSE opened_at END,
    clicked_at = CASE WHEN NEW.event_kind='clicked' THEN least(clicked_at,NEW.occurred_at) ELSE clicked_at END,
    first_opened_at = CASE WHEN NEW.event_kind='opened' THEN least(first_opened_at,NEW.occurred_at) ELSE first_opened_at END,
    last_opened_at = CASE WHEN NEW.event_kind='opened' THEN greatest(last_opened_at,NEW.occurred_at) ELSE last_opened_at END,
    first_clicked_at = CASE WHEN NEW.event_kind='clicked' THEN least(first_clicked_at,NEW.occurred_at) ELSE first_clicked_at END,
    last_clicked_at = CASE WHEN NEW.event_kind='clicked' THEN greatest(last_clicked_at,NEW.occurred_at) ELSE last_clicked_at END,
    last_event_at = greatest(last_event_at,NEW.occurred_at)
  WHERE id=NEW.send_id;
  IF NEW.event_kind='clicked' THEN
    -- Deterministic ties use stable provenance/key, not insertion order.
    UPDATE public.campaign_send SET last_clicked_url=(
      SELECT e.url FROM public.campaign_send_event e
      WHERE e.send_id=NEW.send_id AND e.event_kind='clicked'
      ORDER BY e.occurred_at DESC,e.event_source COLLATE "C" DESC,
               e.event_key COLLATE "C" DESC LIMIT 1
    ) WHERE id=NEW.send_id;
  END IF;
  IF s.contact_id IS NOT NULL THEN
    UPDATE public.contact SET
      emails_delivered = emails_delivered+delivery_increment,
      emails_opened = emails_opened+CASE WHEN NEW.event_kind='opened' THEN 1 ELSE 0 END,
      emails_clicked = emails_clicked+CASE WHEN NEW.event_kind='clicked' THEN 1 ELSE 0 END,
      last_email_send_date = CASE WHEN NEW.event_kind='sent' THEN greatest(last_email_send_date,NEW.occurred_at) ELSE last_email_send_date END,
      last_email_open_date = CASE WHEN NEW.event_kind='opened' THEN greatest(last_email_open_date,NEW.occurred_at) ELSE last_email_open_date END,
      last_email_click_date = CASE WHEN NEW.event_kind='clicked' THEN greatest(last_email_click_date,NEW.occurred_at) ELSE last_email_click_date END,
      last_activity_date = greatest(last_activity_date,NEW.occurred_at),
      unsubscribed_all = unsubscribed_all OR NEW.event_kind IN ('unsubscribed','complained'),
      unsubscribed_all_email = unsubscribed_all_email OR NEW.event_kind IN ('unsubscribed','complained')
    WHERE id=s.contact_id;
  END IF;
  RETURN NEW;
END $body$;
CREATE TRIGGER p8r_event_rollup AFTER INSERT ON public.campaign_send_event
FOR EACH ROW EXECUTE FUNCTION public.p8r_rollup_event();

-- Caller supplies stable provider event ID. Retries with a conflicting payload
-- are rejected rather than silently accepted as the same historical event.
CREATE FUNCTION public.record_campaign_send_event(
  p_send uuid,p_kind text,p_time timestamptz,p_source text,p_key text,
  p_url text DEFAULT NULL,p_raw jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog, public AS $body$
DECLARE result uuid; prior public.campaign_send_event; canonical_kind text;
BEGIN
  IF p_time IS NULL OR p_source IS NULL OR btrim(p_source)='' OR p_key IS NULL OR btrim(p_key)='' THEN
    RAISE EXCEPTION 'Occurrence time, source and stable event key are required' USING ERRCODE='22023';
  END IF;
  canonical_kind := CASE p_kind WHEN 'complaint' THEN 'complained' ELSE p_kind END;
  PERFORM public.p8r_lock_send(p_send);
  INSERT INTO public.campaign_send_event(send_id,event_kind,occurred_at,event_source,event_key,url,raw)
  VALUES(p_send,canonical_kind,p_time,p_source,p_key,p_url,coalesce(p_raw,'{}'::jsonb))
  ON CONFLICT ON CONSTRAINT p8r_event_dedup DO NOTHING RETURNING id INTO result;
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT * INTO STRICT prior FROM public.campaign_send_event
    WHERE send_id=p_send AND event_source=p_source AND event_key=p_key;
  IF ROW(prior.event_kind,prior.occurred_at,prior.url,prior.raw)
       IS DISTINCT FROM ROW(canonical_kind,p_time,p_url,coalesce(p_raw,'{}'::jsonb)) THEN
    RAISE EXCEPTION 'Idempotency key reused with different payload' USING ERRCODE='22023';
  END IF;
  RETURN prior.id;
END $body$;

CREATE FUNCTION public.p8r_reject_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $body$
BEGIN RAISE EXCEPTION 'Event evidence is append-only; correction/archive requires separate approval'
 USING ERRCODE='55000'; END $body$;
CREATE TRIGGER p8r_event_immutable BEFORE UPDATE OR DELETE ON public.campaign_send_event
FOR EACH ROW EXECUTE FUNCTION public.p8r_reject_event_mutation();

CREATE FUNCTION public.p8r_recipient_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $body$
BEGIN
  IF ROW(OLD.contact_id,OLD.person_id) IS DISTINCT FROM ROW(NEW.contact_id,NEW.person_id)
     AND EXISTS(SELECT 1 FROM public.campaign_send_event WHERE send_id=OLD.id) THEN
    RAISE EXCEPTION 'Cannot reassign an event-bearing send without a reviewed aggregate rebuild'
      USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $body$;
CREATE TRIGGER p8r_send_recipient_immutable BEFORE UPDATE OF contact_id,person_id
ON public.campaign_send FOR EACH ROW EXECUTE FUNCTION public.p8r_recipient_immutable();

REVOKE ALL ON FUNCTION public.p8r_status_rank(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p8r_lock_send(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p8r_rollup_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_campaign_send_event(uuid,text,timestamptz,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p8r_reject_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p8r_recipient_immutable() FROM PUBLIC;
REVOKE ALL ON TABLE public.campaign_send_event FROM PUBLIC;
-- No runtime grants are invented. Role-specific grants require a separate review.
