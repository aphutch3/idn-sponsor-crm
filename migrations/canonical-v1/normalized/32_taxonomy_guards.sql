BEGIN;
CREATE FUNCTION public.normalize_tag_alias() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.normalized_alias:=btrim(lower(regexp_replace(btrim(NEW.alias),'[^[:alnum:]]+',' ','g')));
 IF NEW.normalized_alias='' THEN RAISE EXCEPTION 'Alias must contain letters or digits'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tag_alias_normalize BEFORE INSERT OR UPDATE ON public.tag_alias
 FOR EACH ROW EXECUTE FUNCTION public.normalize_tag_alias();
ALTER TABLE public.tag_redirect ADD CONSTRAINT tag_redirect_retired_fk
 FOREIGN KEY(retired_tag_id) REFERENCES public.tag(id) ON DELETE RESTRICT;
CREATE FUNCTION public.guard_tag_redirect() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(7092026,305);
 IF EXISTS(WITH RECURSIVE chain(id) AS (
   SELECT NEW.surviving_tag_id UNION
   SELECT r.surviving_tag_id FROM public.tag_redirect r JOIN chain c ON c.id=r.retired_tag_id
   WHERE r.retired_tag_id<>NEW.retired_tag_id)
   SELECT 1 FROM chain WHERE id=NEW.retired_tag_id) THEN
   RAISE EXCEPTION 'Tag redirect cycle';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tag_redirect_guard BEFORE INSERT OR UPDATE ON public.tag_redirect
 FOR EACH ROW EXECUTE FUNCTION public.guard_tag_redirect();
REVOKE ALL ON FUNCTION public.normalize_tag_alias(),public.guard_tag_redirect() FROM PUBLIC;
COMMIT;
