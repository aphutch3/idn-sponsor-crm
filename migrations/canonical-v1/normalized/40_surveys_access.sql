BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='idn_surveys_app') THEN
  CREATE ROLE idn_surveys_app NOLOGIN;
 END IF;
END $$;
GRANT USAGE ON SCHEMA public,surveys TO idn_surveys_app;
GRANT SELECT(id,full_name,email) ON public.person TO idn_surveys_app;
GRANT SELECT,INSERT,UPDATE ON public.form_definition,public.form_version,public.form_question,public.form_choice,public.external_ref TO idn_surveys_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.form_version_question,public.form_version_choice,public.form_logic_rule TO idn_surveys_app;
GRANT SELECT,INSERT ON public.form_submission,public.form_answer,public.form_answer_choice TO idn_surveys_app;
GRANT SELECT,INSERT,UPDATE ON surveys.survey_definition,surveys.survey_collector,surveys.submission_context TO idn_surveys_app;
GRANT SELECT ON surveys.survey_template TO idn_surveys_app;
-- Preserve every other role's preexisting privilege behavior. Only this new role
-- is narrowed by the following row policies; grants remain the outer boundary.
DO $policy$
DECLARE rel text; predicate text;
BEGIN
 FOR rel,predicate IN SELECT * FROM (VALUES
  ('form_definition','owning_schema = ''surveys'''),
  ('form_version','EXISTS(SELECT 1 FROM public.form_definition d WHERE d.id=form_definition_id AND d.owning_schema=''surveys'')'),
  ('form_question','EXISTS(SELECT 1 FROM public.form_definition d WHERE d.id=form_definition_id AND d.owning_schema=''surveys'')'),
  ('form_choice','EXISTS(SELECT 1 FROM public.form_question q JOIN public.form_definition d ON d.id=q.form_definition_id WHERE q.id=question_id AND d.owning_schema=''surveys'')'),
  ('form_version_question','EXISTS(SELECT 1 FROM public.form_definition d WHERE d.id=form_definition_id AND d.owning_schema=''surveys'')'),
  ('form_version_choice','EXISTS(SELECT 1 FROM public.form_version v JOIN public.form_definition d ON d.id=v.form_definition_id WHERE v.id=form_version_id AND d.owning_schema=''surveys'')'),
  ('form_logic_rule','EXISTS(SELECT 1 FROM public.form_version v JOIN public.form_definition d ON d.id=v.form_definition_id WHERE v.id=form_version_id AND d.owning_schema=''surveys'')'),
  ('form_submission','EXISTS(SELECT 1 FROM public.form_definition d WHERE d.id=form_id AND d.owning_schema=''surveys'')'),
  ('form_answer','EXISTS(SELECT 1 FROM public.form_submission s WHERE s.id=submission_id)'),
  ('form_answer_choice','EXISTS(SELECT 1 FROM public.form_answer a WHERE a.id=answer_id)'),
  ('external_ref','source_system=''idn_surveys_v1'' AND (entity_table=''form_definition'' AND EXISTS(SELECT 1 FROM public.form_definition d WHERE d.id=entity_id AND d.owning_schema=''surveys'') OR entity_table=''form_submission'' AND EXISTS(SELECT 1 FROM public.form_submission s WHERE s.id=entity_id))')
 ) AS x(rel,predicate)
 LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',rel);
  EXECUTE format('CREATE POLICY canonical_existing_roles ON public.%I TO PUBLIC USING(current_user<>''idn_surveys_app'') WITH CHECK(current_user<>''idn_surveys_app'')',rel);
  EXECUTE format('CREATE POLICY surveys_scope ON public.%I TO idn_surveys_app USING(%s) WITH CHECK(%s)',rel,predicate,predicate);
 END LOOP;
END $policy$;
INSERT INTO meta.app_contract(app_code,role_name,schema_name,object_name,access_kind,purpose,requires_audit,approved_at)
SELECT 'idn-surveys','idn_surveys_app',table_schema,table_name,
 CASE WHEN table_name='person' OR table_name='survey_template' THEN 'read' ELSE 'write' END,
 'Server-only normalized Surveys lifecycle; public API exposes published forms only; admin API requires signed session.',
 true,now()
FROM information_schema.tables WHERE table_schema='surveys'
 OR table_schema='public' AND table_name IN
 ('person','form_definition','form_version','form_question','form_choice','form_version_question','form_version_choice','form_logic_rule','form_submission','form_answer','form_answer_choice','external_ref');
COMMIT;
