-- Transitional write bridge: legacy Contact remains supported, but every new
-- Contact resolves to public.person. No name matching or destructive merge.
BEGIN;
CREATE TABLE meta.identity_conflict (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contact_id uuid NOT NULL REFERENCES public.contact(id),
 person_id uuid NOT NULL REFERENCES public.person(id),
 conflicting_person_id uuid NOT NULL REFERENCES public.person(id),
 field_name text NOT NULL,
 reason text NOT NULL,
 resolution_state text NOT NULL DEFAULT 'open' CHECK(resolution_state IN ('open','resolved','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(contact_id,conflicting_person_id,field_name)
);
INSERT INTO meta.identity_conflict(contact_id,person_id,conflicting_person_id,field_name,reason)
SELECT c.id,c.person_id,p.id,'linkedin_url','Same source LinkedIn URL but different email. Preserved separately; no automatic merge.'
FROM public.contact c JOIN public.person p ON p.linkedin_url=c.linkedin_url
WHERE c.person_id<>p.id ON CONFLICT DO NOTHING;

INSERT INTO public.person_company_role(person_id,company_id,relationship_kind,title,source_system,evidence)
SELECT DISTINCT c.person_id,cc.company_id,'employee',cc.role,'canonical',
 jsonb_build_object('source','legacy contact_company','legacy_contact_id',c.id,'is_primary',cc.is_primary)
FROM public.contact_company cc JOIN public.contact c ON c.id=cc.contact_id
WHERE NOT EXISTS(SELECT 1 FROM public.person_company_role r
 WHERE r.person_id=c.person_id AND r.company_id=cc.company_id AND r.relationship_kind='employee')
ON CONFLICT DO NOTHING;

CREATE FUNCTION public.bridge_legacy_contact_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target uuid; linked uuid;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 target:=NEW.person_id;
 IF target IS NULL THEN
   IF NEW.email IS NOT NULL THEN
     SELECT id INTO target FROM public.person WHERE email=NEW.email;
   END IF;
   IF target IS NULL THEN
     SELECT id INTO linked FROM public.person WHERE linkedin_url=NEW.linkedin_url;
     INSERT INTO public.person(contact_id,full_name,first_name,last_name,email,current_company_id,current_title,linkedin_url,
       do_not_contact,do_not_market,raw)
     VALUES(NEW.id,coalesce(nullif(NEW.full_name,''),NEW.email::text,'Unnamed source contact'),
       NEW.first_name,NEW.last_name,NEW.email,NEW.company_id,NEW.job_title,
       CASE WHEN linked IS NULL THEN NEW.linkedin_url ELSE NULL END,
       coalesce(NEW.unsubscribed_all,false) OR coalesce(NEW.unsubscribed_all_email,false),
       coalesce(NEW.opted_out_marketing,false),
       jsonb_build_object('identity_origin','legacy contact write bridge','source_linkedin_url',NEW.linkedin_url))
     ON CONFLICT(email) WHERE email IS NOT NULL DO UPDATE SET email=EXCLUDED.email
     RETURNING id INTO target;
     IF linked IS NOT NULL AND linked<>target THEN
       INSERT INTO meta.identity_conflict(contact_id,person_id,conflicting_person_id,field_name,reason)
       VALUES(NEW.id,target,linked,'linkedin_url','Legacy write collision; source claim retained without name-only merge.')
       ON CONFLICT DO NOTHING;
     END IF;
   END IF;
   UPDATE public.contact SET person_id=target WHERE id=NEW.id;
 END IF;
 -- Suppression is monotonic. Clearing a legacy flag cannot silently re-opt-in
 -- a canonical person; a separate consent workflow is required.
 UPDATE public.person SET
  do_not_contact=do_not_contact OR coalesce(NEW.unsubscribed_all,false) OR coalesce(NEW.unsubscribed_all_email,false),
  do_not_market=do_not_market OR coalesce(NEW.opted_out_marketing,false)
 WHERE id=target;
 INSERT INTO engager.person_profile(person_id,outreach_state,lead_state,legacy_owner_label,key_contact)
 VALUES(target,CASE WHEN NEW.unsubscribed_all OR NEW.unsubscribed_all_email OR NEW.opted_out_marketing THEN 'suppressed' ELSE 'unknown' END,
 NEW.lead_status,NEW.owner,coalesce(NEW.key_contact,'{}'))
 ON CONFLICT(person_id) DO UPDATE SET
  outreach_state=CASE WHEN EXCLUDED.outreach_state='suppressed' THEN 'suppressed' ELSE engager.person_profile.outreach_state END,
  lead_state=EXCLUDED.lead_state,legacy_owner_label=EXCLUDED.legacy_owner_label,key_contact=EXCLUDED.key_contact,updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER contact_canonical_identity_bridge AFTER INSERT OR UPDATE OF person_id,email,unsubscribed_all,
 unsubscribed_all_email,opted_out_marketing,lead_status,owner,key_contact ON public.contact
 FOR EACH ROW EXECUTE FUNCTION public.bridge_legacy_contact_identity();
COMMENT ON FUNCTION public.bridge_legacy_contact_identity() IS
 'Transitional legacy writer bridge: canonical identity and monotonic consent, private Engager workflow mirrored. Shared factual edits must use public.person; not a bidirectional fact synchronizer.';
REVOKE ALL ON FUNCTION public.bridge_legacy_contact_identity() FROM PUBLIC;
COMMIT;
