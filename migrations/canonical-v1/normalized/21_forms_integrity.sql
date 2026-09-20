-- Explicit canonical-v1 correction, 2026-09-20.
-- Additive migration. No source data or legacy schema is deleted.
BEGIN;
ALTER TABLE public.form_submission
  ADD CONSTRAINT form_submission_version_definition_fk
  FOREIGN KEY (form_version_id,form_id)
  REFERENCES public.form_version(id,form_definition_id) NOT VALID;
ALTER TABLE public.form_submission VALIDATE CONSTRAINT form_submission_version_definition_fk;

CREATE FUNCTION public.guard_form_version_child() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE old_id uuid; new_id uuid; state text;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_id:=OLD.form_version_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_id:=NEW.form_version_id; END IF;
  -- Same lock as publication; serializes edits against publication.
  FOR state IN SELECT version_state FROM public.form_version
    WHERE id IN (old_id,new_id) ORDER BY id FOR UPDATE
  LOOP
    IF state <> 'draft' THEN RAISE EXCEPTION 'Published/retired form content is immutable'; END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER form_question_version_immutable BEFORE INSERT OR UPDATE OR DELETE
 ON public.form_version_question FOR EACH ROW EXECUTE FUNCTION public.guard_form_version_child();
CREATE TRIGGER form_choice_version_immutable BEFORE INSERT OR UPDATE OR DELETE
 ON public.form_version_choice FOR EACH ROW EXECUTE FUNCTION public.guard_form_version_child();
CREATE TRIGGER form_logic_version_immutable BEFORE INSERT OR UPDATE OR DELETE
 ON public.form_logic_rule FOR EACH ROW EXECUTE FUNCTION public.guard_form_version_child();

CREATE OR REPLACE FUNCTION public.prevent_published_form_version_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.version_state IN ('published','retired') THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Published form versions cannot be deleted'; END IF;
    IF NEW IS DISTINCT FROM OLD THEN
      -- Retirement is allowed but cannot mutate the historical snapshot.
      IF NOT (OLD.version_state='published' AND NEW.version_state='retired'
        AND (to_jsonb(NEW)-'version_state'-'updated_at')=(to_jsonb(OLD)-'version_state'-'updated_at')) THEN
        RAISE EXCEPTION 'Published form versions are immutable';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.validate_form_answer() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a public.form_answer; q public.form_version_question; n integer; ranked integer;
  target uuid; scalars integer;
BEGIN
  IF TG_TABLE_NAME='form_answer' THEN
    IF TG_OP='DELETE' THEN target:=OLD.id; ELSE target:=NEW.id; END IF;
  ELSE
    IF TG_OP='DELETE' THEN target:=OLD.answer_id; ELSE target:=NEW.answer_id; END IF;
    IF TG_OP='UPDATE' AND NEW.answer_id<>OLD.answer_id THEN
      RAISE EXCEPTION 'Answer choice cannot be reparented';
    END IF;
  END IF;
  SELECT * INTO a FROM public.form_answer WHERE id=target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO STRICT q FROM public.form_version_question
    WHERE form_version_id=a.form_version_id AND question_id=a.question_id;
  SELECT count(*),count(rank) INTO n,ranked FROM public.form_answer_choice WHERE answer_id=target;
  scalars:=num_nonnulls(a.text_value,a.numeric_value,a.boolean_value,a.date_value,a.timestamp_value,a.media_asset_id);
  IF q.question_kind IN ('single_choice','dropdown','multi_choice','ranking') THEN
    IF scalars<>0 OR n=0 OR (q.question_kind IN ('single_choice','dropdown') AND n<>1)
      OR (q.question_kind='ranking' AND ranked<>n)
      OR (q.question_kind<>'ranking' AND ranked<>0) THEN
      RAISE EXCEPTION 'Invalid normalized choice answer';
    END IF;
  ELSE
    IF scalars<>1 OR n<>0 THEN RAISE EXCEPTION 'Expected exactly one typed scalar answer'; END IF;
    IF q.question_kind IN ('short_text','long_text','email') AND a.text_value IS NULL
      OR q.question_kind IN ('number','nps','rating','csat') AND a.numeric_value IS NULL
      OR q.question_kind='date' AND a.date_value IS NULL
      OR q.question_kind='file_upload' AND a.media_asset_id IS NULL
      OR q.question_kind IN ('statement','section_header') THEN
      RAISE EXCEPTION 'Answer type does not match question kind';
    END IF;
    IF q.question_kind='nps' AND (a.numeric_value<0 OR a.numeric_value>10 OR a.numeric_value<>trunc(a.numeric_value)) THEN
      RAISE EXCEPTION 'NPS must be an integer between zero and ten';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER form_answer_typed
 AFTER INSERT OR UPDATE ON public.form_answer DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION public.validate_form_answer();
CREATE CONSTRAINT TRIGGER form_answer_choice_typed
 AFTER INSERT OR UPDATE OR DELETE ON public.form_answer_choice DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION public.validate_form_answer();

CREATE TABLE surveys.survey_template (
  form_definition_id uuid PRIMARY KEY REFERENCES public.form_definition(id) ON DELETE RESTRICT,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE surveys.submission_context (
  submission_id uuid PRIMARY KEY REFERENCES public.form_submission(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK(source_kind IN ('link','embed','email','summit_kiosk')),
  duration_seconds integer NOT NULL CHECK(duration_seconds>=0),
  anonymous_label text,
  is_identified boolean NOT NULL DEFAULT false,
  legacy_source_evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX form_submission_definition_time_idx ON public.form_submission(form_id,submitted_at DESC);
CREATE INDEX form_answer_version_question_idx ON public.form_answer(form_version_id,question_id);
CREATE INDEX form_version_definition_state_idx ON public.form_version(form_definition_id,version_state,version_number DESC);
COMMENT ON TABLE surveys.survey_template IS 'Template classification for a normalized shared form; not a duplicate JSON question store.';
COMMENT ON TABLE surveys.submission_context IS 'Survey-specific collection context. Canonical answers live in public.form_answer and public.form_answer_choice.';
COMMENT ON FUNCTION public.validate_form_answer() IS 'Deferred typed-answer invariant, including normalized choices and rankings.';
REVOKE ALL ON FUNCTION public.guard_form_version_child(),public.validate_form_answer() FROM PUBLIC;
COMMIT;
