-- IDN Canonical Schema Contract v1
-- Release candidate canonical-v1. Execute only through the guarded release runner.
-- Adds normalized versioned forms while preserving current JSON columns for transition.

begin;

create schema if not exists surveys;

-- Extend, do not replace, the current allowed form kinds.
alter table public.form_definition
  drop constraint if exists form_definition_kind_check;
alter table public.form_definition
  add constraint form_definition_kind_check
  check (kind in (
    'survey', 'summit_registration', 'gated_download',
    'rsvp', 'contact', 'newsletter', 'custom'
  ));

alter table public.form_definition
  add column if not exists owning_schema text not null default 'public',
  add column if not exists lifecycle_state text not null default 'active';

alter table public.form_definition
  drop constraint if exists form_definition_lifecycle_state_check;
alter table public.form_definition
  add constraint form_definition_lifecycle_state_check
  check (lifecycle_state in ('draft', 'active', 'archived'));

create table if not exists public.form_version (
  id uuid primary key default gen_random_uuid(),
  form_definition_id uuid not null
    references public.form_definition(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  version_state text not null default 'draft'
    check (version_state in ('draft', 'published', 'retired')),
  title text,
  description text,
  submit_label text,
  success_message text,
  redirect_url text,
  presentation_config jsonb not null default '{}'::jsonb,
  source_evidence jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_by_person_id uuid references public.person(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_definition_id, version_number),
  unique (id, form_definition_id),
  check (
    (version_state = 'published' and published_at is not null)
    or version_state <> 'published'
  )
);

create table if not exists public.form_question (
  id uuid primary key default gen_random_uuid(),
  form_definition_id uuid not null
    references public.form_definition(id) on delete restrict,
  question_code text not null,
  created_at timestamptz not null default now(),
  unique (form_definition_id, question_code),
  unique (id, form_definition_id)
);

create table if not exists public.form_version_question (
  form_version_id uuid not null,
  form_definition_id uuid not null,
  question_id uuid not null,
  question_kind text not null
    check (question_kind in (
      'short_text', 'long_text', 'single_choice', 'multi_choice',
      'dropdown', 'rating', 'nps', 'csat', 'ranking',
      'date', 'number', 'email', 'file_upload',
      'statement', 'section_header'
    )),
  title text not null,
  description text,
  is_required boolean not null default false,
  ordinal integer not null check (ordinal >= 0),
  page_number integer check (page_number is null or page_number >= 0),
  validation_config jsonb not null default '{}'::jsonb,
  presentation_config jsonb not null default '{}'::jsonb,
  primary key (form_version_id, question_id),
  unique (form_version_id, ordinal),
  foreign key (form_version_id, form_definition_id)
    references public.form_version(id, form_definition_id) on delete cascade,
  foreign key (question_id, form_definition_id)
    references public.form_question(id, form_definition_id) on delete restrict
);

create table if not exists public.form_choice (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.form_question(id) on delete restrict,
  choice_code text not null,
  created_at timestamptz not null default now(),
  unique (question_id, choice_code),
  unique (id, question_id)
);

create table if not exists public.form_version_choice (
  form_version_id uuid not null,
  question_id uuid not null,
  choice_id uuid not null,
  label text not null,
  ordinal integer not null check (ordinal >= 0),
  is_enabled boolean not null default true,
  primary key (form_version_id, question_id, choice_id),
  unique (form_version_id, question_id, ordinal),
  foreign key (form_version_id, question_id)
    references public.form_version_question(form_version_id, question_id)
    on delete cascade,
  foreign key (choice_id, question_id)
    references public.form_choice(id, question_id)
    on delete restrict
);

create table if not exists public.form_logic_rule (
  id uuid primary key default gen_random_uuid(),
  form_version_id uuid not null,
  source_question_id uuid not null,
  target_question_id uuid not null,
  operator_kind text not null
    check (operator_kind in ('is', 'is_not', 'less_than_or_equal', 'greater_than_or_equal', 'answered')),
  comparison_value jsonb,
  action_kind text not null check (action_kind in ('show', 'hide')),
  ordinal integer not null default 0 check (ordinal >= 0),
  foreign key (form_version_id, source_question_id)
    references public.form_version_question(form_version_id, question_id)
    on delete cascade,
  foreign key (form_version_id, target_question_id)
    references public.form_version_question(form_version_id, question_id)
    on delete cascade,
  check (source_question_id <> target_question_id),
  unique (form_version_id, target_question_id, ordinal)
);

-- Transitional additions. form_version_id becomes NOT NULL only after backfill.
alter table public.form_submission
  add column if not exists form_version_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists is_completed boolean not null default true,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.form_submission'::regclass
      and conname = 'form_submission_form_version_id_fkey'
  ) then
    alter table public.form_submission
      add constraint form_submission_form_version_id_fkey
      foreign key (form_version_id)
      references public.form_version(id)
      on delete restrict
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.form_submission'::regclass
      and conname = 'form_submission_id_version_uk'
  ) then
    alter table public.form_submission
      add constraint form_submission_id_version_uk
      unique (id, form_version_id);
  end if;
end $$;

create unique index if not exists form_submission_idempotency_uk
  on public.form_submission (form_version_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.form_answer (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  form_version_id uuid not null,
  question_id uuid not null,
  text_value text,
  numeric_value numeric,
  boolean_value boolean,
  date_value date,
  timestamp_value timestamptz,
  media_asset_id uuid references public.media_asset(id) on delete restrict,
  answered_at timestamptz not null default now(),
  source_evidence jsonb not null default '{}'::jsonb,
  foreign key (submission_id, form_version_id)
    references public.form_submission(id, form_version_id)
    on delete cascade,
  foreign key (form_version_id, question_id)
    references public.form_version_question(form_version_id, question_id)
    on delete restrict,
  unique (id, form_version_id, question_id),
  unique (submission_id, question_id),
  check (
    num_nonnulls(
      text_value, numeric_value, boolean_value,
      date_value, timestamp_value, media_asset_id
    ) <= 1
  )
);

create table if not exists public.form_answer_choice (
  answer_id uuid not null references public.form_answer(id) on delete cascade,
  form_version_id uuid not null,
  question_id uuid not null,
  choice_id uuid not null,
  rank integer check (rank is null or rank > 0),
  selected_at timestamptz not null default now(),
  primary key (answer_id, choice_id),
  foreign key (answer_id, form_version_id, question_id)
    references public.form_answer(id, form_version_id, question_id)
    on delete cascade,
  foreign key (form_version_id, question_id, choice_id)
    references public.form_version_choice(form_version_id, question_id, choice_id)
    on delete restrict
);

create unique index if not exists form_answer_choice_rank_uk
  on public.form_answer_choice (answer_id, rank)
  where rank is not null;

create table if not exists surveys.survey_definition (
  form_definition_id uuid primary key
    references public.form_definition(id) on delete cascade,
  identity_mode text not null
    check (identity_mode in ('anonymous', 'optional_identity', 'signed_token')),
  default_layout text not null
    check (default_layout in ('classic', 'conversational')),
  allow_multiple_submissions boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists surveys.survey_collector (
  id uuid primary key default gen_random_uuid(),
  form_definition_id uuid not null
    references surveys.survey_definition(form_definition_id) on delete cascade,
  collector_kind text not null
    check (collector_kind in ('link', 'embed', 'email', 'summit_kiosk')),
  collector_key text not null,
  is_active boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_definition_id, collector_key)
);

-- Transitional event linkage. The old form_id remains until migration completes.
alter table events.registration
  add column if not exists form_submission_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'events.registration'::regclass
      and conname = 'registration_form_submission_id_fkey'
  ) then
    alter table events.registration
      add constraint registration_form_submission_id_fkey
      foreign key (form_submission_id)
      references public.form_submission(id)
      on delete restrict
      not valid;
  end if;
end $$;

create unique index if not exists registration_form_submission_uk
  on events.registration (form_submission_id)
  where form_submission_id is not null;

create or replace function public.prevent_published_form_version_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.version_state = 'published' then
      raise exception 'published form versions are immutable';
    end if;
    return old;
  end if;

  if old.version_state = 'published' and new is distinct from old then
    raise exception 'published form versions are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists form_version_immutable_when_published on public.form_version;
create trigger form_version_immutable_when_published
before update or delete on public.form_version
for each row execute function public.prevent_published_form_version_update();

comment on table public.form_version is
  'One version of a shared form definition. Published versions are immutable.';
comment on table public.form_question is
  'Stable logical question identity within a shared form definition.';
comment on table public.form_version_question is
  'Version-specific question wording, kind, validation, and presentation.';
comment on table public.form_answer is
  'One typed scalar answer to one question in one form submission.';
comment on table public.form_answer_choice is
  'One selected or ranked choice belonging to an answer.';
comment on table surveys.survey_definition is
  'Survey-specific extension of one shared form definition.';

-- Later enforcement migration, only after backfill and application cutover:
-- * validate form_submission_form_version_id_fkey;
-- * set form_submission.form_version_id not null;
-- * replace form_submission.form_id cascade behavior with retention-safe restrict;
-- * retire form_definition.fields and form_submission.data as writable sources;
-- * migrate and retire events.registration_form.

commit;
