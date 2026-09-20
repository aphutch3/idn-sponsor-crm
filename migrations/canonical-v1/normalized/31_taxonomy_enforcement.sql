BEGIN;
CREATE FUNCTION public.normalize_tag_label() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.normalized_label:=btrim(lower(regexp_replace(btrim(NEW.label),'[^[:alnum:]]+',' ','g')));
 IF NEW.normalized_label='' THEN RAISE EXCEPTION 'A tag must contain letters or digits'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tag_normalize BEFORE INSERT OR UPDATE OF label ON public.tag
 FOR EACH ROW EXECUTE FUNCTION public.normalize_tag_label();
UPDATE public.tag SET label=label;
ALTER TABLE public.tag ALTER COLUMN normalized_label SET NOT NULL;
ALTER TABLE public.tag VALIDATE CONSTRAINT tag_parent_id_fkey;
ALTER TABLE public.tag VALIDATE CONSTRAINT tag_source_system_fkey;
ALTER TABLE public.entity_tag VALIDATE CONSTRAINT entity_tag_source_system_fkey;
CREATE UNIQUE INDEX external_ref_resolution_uk ON public.external_ref(entity_table,source_system,external_id);
COMMENT ON INDEX public.external_ref_resolution_uk IS 'A source foreign ID identifies at most one canonical entity within its entity kind.';
COMMIT;
