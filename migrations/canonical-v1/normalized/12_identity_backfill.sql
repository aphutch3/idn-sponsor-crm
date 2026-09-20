-- Additive identity bridge. Contact IDs stay valid for old app contracts.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.person,public.contact,public.external_ref IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE meta.identity_resolution_audit (
 contact_id uuid PRIMARY KEY REFERENCES public.contact(id),
 person_id uuid NOT NULL REFERENCES public.person(id),
 resolution_rule text NOT NULL,
 evidence jsonb NOT NULL,
 resolved_at timestamptz NOT NULL DEFAULT now()
);
-- An exact email is used only when it points at exactly one existing person.
INSERT INTO meta.identity_resolution_audit(contact_id,person_id,resolution_rule,evidence)
SELECT c.id,min(p.id::text)::uuid,'unique_exact_email',
 jsonb_build_object('matched_person_count',count(*),'not_name_matching',true)
FROM public.contact c JOIN public.person p ON p.email=c.email
WHERE c.person_id IS NULL AND c.email IS NOT NULL
GROUP BY c.id HAVING count(*)=1;
UPDATE public.contact c SET person_id=a.person_id
FROM meta.identity_resolution_audit a WHERE a.contact_id=c.id AND c.person_id IS NULL;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.contact c JOIN public.person p ON p.email=c.email WHERE c.person_id IS NULL) THEN
  RAISE EXCEPTION 'Ambiguous existing email match; identity review is required';
 END IF;
END $$;
INSERT INTO public.person(id,contact_id,full_name,first_name,last_name,email,current_company_id,current_title,linkedin_url,do_not_contact,do_not_market,raw)
SELECT md5('canonical-v1-contact:'||c.id::text)::uuid,c.id,
 coalesce(nullif(c.full_name,''),nullif(concat_ws(' ',c.first_name,c.last_name),''),c.email::text,'Unnamed source contact'),
 c.first_name,c.last_name,c.email,c.company_id,c.job_title,
 CASE WHEN EXISTS(SELECT 1 FROM public.person existing WHERE existing.linkedin_url=c.linkedin_url)
 THEN NULL ELSE c.linkedin_url END,
 c.unsubscribed_all OR c.unsubscribed_all_email,c.opted_out_marketing,
 jsonb_build_object('identity_origin','existing Engager contact','legacy_contact_id',c.id,
 'source_linkedin_url',c.linkedin_url,
 'linkedin_conflict',EXISTS(SELECT 1 FROM public.person existing WHERE existing.linkedin_url=c.linkedin_url))
FROM public.contact c WHERE c.person_id IS NULL;
INSERT INTO meta.identity_resolution_audit(contact_id,person_id,resolution_rule,evidence)
SELECT c.id,p.id,'new_identity_from_existing_contact',jsonb_build_object('contact_id',c.id,'not_name_matching',true)
FROM public.contact c JOIN public.person p ON p.contact_id=c.id WHERE c.person_id IS NULL;
UPDATE public.contact c SET person_id=a.person_id FROM meta.identity_resolution_audit a WHERE a.contact_id=c.id AND c.person_id IS NULL;
INSERT INTO public.external_ref(entity_table,entity_id,source_system,external_id,evidence)
SELECT 'person',c.person_id,e.source_system,e.external_id,jsonb_build_object('via_contact',c.id,'migration','canonical-v1')
FROM public.contact c JOIN public.external_ref e ON e.entity_table='contact' AND e.entity_id=c.id
ON CONFLICT DO NOTHING;
INSERT INTO public.person_company_role(person_id,company_id,relationship_kind,title,source_system,evidence)
SELECT p.id,p.current_company_id,'employee',p.current_title,'canonical',
 jsonb_build_object('source','person.current_company_id/current_title')
FROM public.person p WHERE p.current_company_id IS NOT NULL
ON CONFLICT DO NOTHING;
ALTER TABLE engager.person_profile ADD COLUMN legacy_owner_label text,
 ADD COLUMN key_contact text[] NOT NULL DEFAULT '{}';
ALTER TABLE engager.company_profile ADD COLUMN legacy_owner_label text;
INSERT INTO engager.person_profile(person_id,outreach_state,buying_influence,lead_state,legacy_owner_label,key_contact)
SELECT p.id,CASE WHEN p.do_not_contact OR p.do_not_market OR bool_or(coalesce(c.unsubscribed_all,false) OR coalesce(c.unsubscribed_all_email,false)) THEN 'suppressed' ELSE 'unknown' END,
 p.buying_influence,max(c.lead_status),max(c.owner),
 coalesce((SELECT array_agg(DISTINCT k) FROM public.contact c2 CROSS JOIN LATERAL unnest(c2.key_contact) k WHERE c2.person_id=p.id),'{}'::text[])
FROM public.person p LEFT JOIN public.contact c ON c.person_id=p.id
GROUP BY p.id;
INSERT INTO engager.company_profile(company_id,sponsor_tier,sponsor_tier_rank,is_customer,is_startup,is_priority,legacy_owner_label)
SELECT id,sponsor_tier,CASE WHEN sponsor_tier_rank>0 THEN sponsor_tier_rank ELSE NULL END,
 is_customer,is_startup,stay_on_top,owner FROM public.company;
UPDATE public.person p SET do_not_contact=p.do_not_contact OR s.suppressed,
 do_not_market=p.do_not_market OR s.marketing_suppressed
FROM (SELECT person_id,bool_or(unsubscribed_all OR unsubscribed_all_email) suppressed,
 bool_or(opted_out_marketing) marketing_suppressed FROM public.contact GROUP BY person_id) s
WHERE s.person_id=p.id AND ((s.suppressed AND NOT p.do_not_contact) OR (s.marketing_suppressed AND NOT p.do_not_market));
CREATE INDEX contact_canonical_person_idx ON public.contact(person_id);
CREATE INDEX person_company_role_source_idx ON public.person_company_role(source_system,person_id);
COMMENT ON TABLE meta.identity_resolution_audit IS 'Audited additive resolution of previously unmapped legacy contacts. No name-only merges or identity deletion.';
COMMENT ON COLUMN public.contact.person_id IS 'Canonical person identity. Contact remains a transitional Engager compatibility record; new shared apps must reference public.person.';
COMMIT;
