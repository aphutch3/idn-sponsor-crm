BEGIN;
CREATE TABLE meta.migration_execution (
 migration_name text PRIMARY KEY,
 sha256 text NOT NULL CHECK(length(sha256)=64),
 executed_at timestamptz NOT NULL DEFAULT now(),
 git_commit text NOT NULL,
 database_name text NOT NULL DEFAULT current_database()
);
INSERT INTO meta.entity_resolution_rule(entity_kind,rule_version,priority,match_key,normalization,auto_match_threshold,requires_review,notes)
VALUES
 ('person',1,1,'source_system + external_id','Exact source-scoped key',1,false,'Unique external_ref resolution key; source lineage retained.'),
 ('person',1,2,'unique exact email','Existing email_address/citext semantics',1,false,'Only a unique existing identity; conflicting non-email claims remain audited.'),
 ('person',1,3,'name','No automatic matching',NULL,true,'Never auto-merge people by name.'),
 ('person',1,4,'conflicting LinkedIn + email','Preserve source claim',NULL,true,'No destructive resolution. Review meta.identity_conflict.'),
 ('tag',1,1,'parent + normalized label','Lowercase Unicode alphanumeric words',1,false,'Sibling label uniqueness; aliases and redirects remain governed.'),
 ('company',1,1,'name','No automatic matching',NULL,true,'Use existing source mappings; name-only company merges are forbidden.');
INSERT INTO meta.object_annotation(schema_name,object_name,object_kind,purpose,row_grain,owning_domain,authority,pii_class,lifecycle_state,replacement_object)
VALUES
 ('public','person','table','Shared canonical person identity','One canonical person','identity','canonical','personal','active',NULL),
 ('public','contact','table','Transitional legacy CRM contact compatibility record','One legacy contact','engager','transitional legacy contract','personal','deprecated','public.person + engager.person_profile'),
 ('public','person_company_role','table','Provenanced person-to-company relationship','One role relationship','identity','canonical','personal','active',NULL),
 ('engager','person_profile','table','Private CRM person workflow','One profile per canonical person','engager','app-owned','personal','active',NULL),
 ('engager','company_profile','table','Private CRM company workflow','One profile per canonical company','engager','app-owned','internal','active',NULL),
 ('public','form_definition','table','Stable shared form identity','One form definition','forms','canonical','internal','active',NULL),
 ('public','form_version','table','Immutable published form snapshot','One numbered form version','forms','canonical','internal','active',NULL),
 ('public','form_question','table','Stable question identity within a form','One stable question','forms','canonical','internal','active',NULL),
 ('public','form_choice','table','Stable choice identity within a question','One stable choice','forms','canonical','internal','active',NULL),
 ('public','form_version_question','table','Versioned question text, type, validation and ordering','One question per version','forms','canonical','internal','active',NULL),
 ('public','form_version_choice','table','Versioned choice label and ordering','One choice per version','forms','canonical','internal','active',NULL),
 ('public','form_logic_rule','table','Normalized conditional display rules','One versioned rule','forms','canonical','internal','active',NULL),
 ('public','form_submission','table','Shared response lifecycle and verified respondent link','One form submission','forms','canonical','personal','active',NULL),
 ('public','form_answer','table','Typed normalized response values','One answer per submission and question','forms','canonical','sensitive','active',NULL),
 ('public','form_answer_choice','table','Normalized selected choices and rank','One selected choice per answer','forms','canonical','sensitive','active',NULL),
 ('surveys','survey_definition','table','Survey-specific form context','One survey per form definition','surveys','app-owned','internal','active',NULL),
 ('surveys','survey_template','table','Reusable normalized template classification','One template per form definition','surveys','app-owned','internal','active',NULL),
 ('surveys','submission_context','table','Survey collection context; legacy identity claims remain unverified','One context per submission','surveys','source evidence','personal','active',NULL),
 ('public','tag','table','Hierarchical canonical topical ontology','One canonical topical tag','taxonomy','canonical','none','active',NULL),
 ('public','external_ref','table','Source-scoped foreign identifier and provenance','One source ID resolving to one entity kind and ID','lineage','canonical','personal','active',NULL),
 ('meta','identity_conflict','table','Non-destructive identity conflicts awaiting review','One conflicting contact/person/field claim','identity','audit','personal','active',NULL);
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM meta.object_annotation LOOP
  EXECUTE format('COMMENT ON TABLE %I.%I IS %L',r.schema_name,r.object_name,r.purpose||'. Grain: '||r.row_grain||'. Authority: '||r.authority||'.');
 END LOOP;
END $$;
UPDATE meta.app_contract SET approved_columns=ARRAY['id','full_name','email']
 WHERE app_code='idn-surveys' AND object_name='person';
COMMENT ON TABLE meta.migration_execution IS 'Executed SQL checksums and Git authority. Never rewrite historical migrations after deployment.';
COMMIT;
