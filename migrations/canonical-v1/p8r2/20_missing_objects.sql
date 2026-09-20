-- P8R1 / reconstructed proposal, NOT historical source. NOT APPLIED.
-- Run only in an explicitly authorized disposable rehearsal, inside one transaction.
SELECT pg_temp.p8r_guard();
SET LOCAL search_path = public, pg_catalog;

CREATE TABLE public.campaign_send_event (id uuid DEFAULT gen_random_uuid() NOT NULL, send_id uuid NOT NULL, event_kind text NOT NULL, occurred_at timestamp with time zone DEFAULT now() NOT NULL, url text, user_agent text, ip_address inet, referrer text, raw jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, CONSTRAINT campaign_send_event_kind_check CHECK (event_kind = ANY(ARRAY[CAST('sent' AS text), CAST('delivered' AS text), CAST('opened' AS text), CAST('clicked' AS text), CAST('bounced' AS text), CAST('complained' AS text), CAST('failed' AS text), CAST('unsubscribed' AS text)])));

CREATE TABLE public.linkedin_signal (id uuid DEFAULT gen_random_uuid() NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, snapshot_id uuid NOT NULL, prior_snapshot_id uuid, signal_kind text NOT NULL, before_value jsonb, after_value jsonb, meta jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, raw jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.list_filter (list_id uuid NOT NULL, filter_json jsonb NOT NULL, refresh_cadence text, last_refreshed_at timestamp with time zone, last_member_count integer, last_error text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.list_version (id uuid DEFAULT gen_random_uuid() NOT NULL, list_id uuid NOT NULL, version_num integer NOT NULL, member_ids uuid[] DEFAULT CAST('{}' AS uuid[]) NOT NULL, member_count integer DEFAULT 0 NOT NULL, reason text, created_at timestamp with time zone DEFAULT now() NOT NULL);

ALTER TABLE ONLY public.campaign_send_event ADD CONSTRAINT campaign_send_event_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.linkedin_signal ADD CONSTRAINT linkedin_signal_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.list_filter ADD CONSTRAINT list_filter_pkey PRIMARY KEY (list_id);

ALTER TABLE ONLY public.list_version ADD CONSTRAINT list_version_list_id_version_num_key UNIQUE (list_id, version_num);

ALTER TABLE ONLY public.list_version ADD CONSTRAINT list_version_pkey PRIMARY KEY (id);

CREATE INDEX campaign_send_event_kind_time_idx ON public.campaign_send_event (event_kind, occurred_at DESC);

CREATE INDEX campaign_send_event_send_idx ON public.campaign_send_event (send_id, event_kind, occurred_at);

CREATE INDEX campaign_send_status_idx ON public.campaign_send (status, campaign_id);

CREATE INDEX company_company_owner_idx ON public.company (company_owner) WHERE company_owner IS NOT NULL;

CREATE INDEX company_group_idx ON public.company ("group");

CREATE INDEX company_rank_stage_idx ON public.company (rank_stage) WHERE rank_stage IS NOT NULL;

CREATE INDEX company_sponsor_tier_rank_idx ON public.company (sponsor_tier_rank) WHERE sponsor_tier_rank IS NOT NULL;

CREATE INDEX company_subcategory_idx ON public.company (subcategory);

CREATE INDEX contact_key_contact_idx ON public.contact USING gin (key_contact);

CREATE INDEX contact_last_email_open_date_idx ON public.contact (last_email_open_date DESC NULLS LAST);

CREATE INDEX linkedin_signal_entity_idx ON public.linkedin_signal (entity_type, entity_id, created_at DESC);

CREATE INDEX linkedin_signal_kind_idx ON public.linkedin_signal (signal_kind, created_at DESC);

CREATE INDEX linkedin_signal_snapshot_idx ON public.linkedin_signal (snapshot_id);

CREATE INDEX list_version_list_id_idx ON public.list_version (list_id, version_num DESC);

CREATE INDEX task_assigned_to_idx ON public.task (assigned_to);

CREATE INDEX task_origin_idx ON public.task (origin);

ALTER TABLE ONLY public.campaign_send_event ADD CONSTRAINT campaign_send_event_send_id_fkey FOREIGN KEY (send_id) REFERENCES public.campaign_send (id) ON DELETE CASCADE;

ALTER TABLE ONLY public.linkedin_signal ADD CONSTRAINT linkedin_signal_prior_snapshot_id_fkey FOREIGN KEY (prior_snapshot_id) REFERENCES public.linkedin_snapshot (id) ON DELETE SET NULL;

ALTER TABLE ONLY public.linkedin_signal ADD CONSTRAINT linkedin_signal_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.linkedin_snapshot (id) ON DELETE CASCADE;

ALTER TABLE ONLY public.list_filter ADD CONSTRAINT list_filter_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.list (id) ON DELETE CASCADE;

ALTER TABLE ONLY public.list_version ADD CONSTRAINT list_version_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.list (id) ON DELETE CASCADE;


CREATE FUNCTION public.p8r_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $body$
BEGIN NEW.updated_at := now(); RETURN NEW; END $body$;
REVOKE ALL ON FUNCTION public.p8r_touch_updated_at() FROM PUBLIC;
CREATE TRIGGER p8r_monitor_updated BEFORE UPDATE ON public.linkedin_monitor_config
FOR EACH ROW EXECUTE FUNCTION public.p8r_touch_updated_at();
CREATE TRIGGER p8r_binding_updated BEFORE UPDATE ON public.list_binding
FOR EACH ROW EXECUTE FUNCTION public.p8r_touch_updated_at();
CREATE TRIGGER p8r_filter_updated BEFORE UPDATE ON public.list_filter
FOR EACH ROW EXECUTE FUNCTION public.p8r_touch_updated_at();
