-- 74_content_kind_guard.sql  (release canonical-v3-signals)
--
-- A platform detail row must hang off a content_item of the MATCHING kind.
--
-- Without this, nothing stops an x-post detail row from attaching to a
-- youtube_video content_item. The tables would still be referentially valid
-- while the data became nonsense, and because every read joins detail to
-- content_item by id, the error would surface far from its cause.
--
-- One generic trigger function reads the required kind from the trigger
-- argument, so adding a fifth platform means adding a trigger, not a function.

begin;

create or replace function signals.validate_content_kind()
returns trigger
language plpgsql
as $$
declare
  required_kind text := tg_argv[0];
  actual_kind   text;
begin
  select kind::text into actual_kind
  from public.content_item
  where id = new.content_item_id;

  -- The FK guarantees existence, but a NULL here would mean the row vanished
  -- between the FK check and this trigger; fail loudly rather than pass.
  if actual_kind is null then
    raise exception 'content_item % not found', new.content_item_id
      using errcode = '23503';
  end if;

  if actual_kind <> required_kind then
    raise exception
      '%.% requires a content_item of kind %, but item % is kind %',
      tg_table_schema, tg_table_name, required_kind,
      new.content_item_id, actual_kind
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function signals.validate_content_kind() is
  'Generic guard: asserts the parent content_item.kind matches the kind expected by the platform detail table, passed as the trigger argument.';

create trigger content_x_post_kind
  before insert or update of content_item_id on signals.content_x_post
  for each row execute function signals.validate_content_kind('x_post');

create trigger content_youtube_video_kind
  before insert or update of content_item_id on signals.content_youtube_video
  for each row execute function signals.validate_content_kind('youtube_video');

create trigger content_github_repo_kind
  before insert or update of content_item_id on signals.content_github_repo
  for each row execute function signals.validate_content_kind('github_repo');

create trigger content_linkedin_post_kind
  before insert or update of content_item_id on signals.content_linkedin_post
  for each row execute function signals.validate_content_kind('linkedin_post');

-- ---------------------------------------------------------------------------
-- Account/platform agreement
-- ---------------------------------------------------------------------------
-- An x-post's author account must be an X account, not a GitHub one. Same
-- reasoning as above: cheap to enforce, silently corrupting if not.
create or replace function signals.validate_account_platform()
returns trigger
language plpgsql
as $$
declare
  required_platform text := tg_argv[0];
  col               text := tg_argv[1];
  acct_id           uuid;
  acct_platform     text;
begin
  execute format('select ($1).%I', col) into acct_id using new;

  if acct_id is null then
    return new;   -- unresolved author is legitimate
  end if;

  select platform into acct_platform
  from signals.platform_account where id = acct_id;

  if acct_platform is distinct from required_platform then
    raise exception
      '%.%.% must reference a % account, got %',
      tg_table_schema, tg_table_name, col, required_platform,
      coalesce(acct_platform, 'missing account')
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function signals.validate_account_platform() is
  'Generic guard: asserts a referenced signals.platform_account is on the expected platform. NULL passes, because an unresolved author is legitimate.';

create trigger content_x_post_account
  before insert or update of author_account_id on signals.content_x_post
  for each row execute function signals.validate_account_platform('x','author_account_id');

create trigger content_youtube_video_account
  before insert or update of channel_account_id on signals.content_youtube_video
  for each row execute function signals.validate_account_platform('youtube','channel_account_id');

create trigger content_github_repo_account
  before insert or update of owner_account_id on signals.content_github_repo
  for each row execute function signals.validate_account_platform('github','owner_account_id');

create trigger content_linkedin_post_account
  before insert or update of author_account_id on signals.content_linkedin_post
  for each row execute function signals.validate_account_platform('linkedin','author_account_id');

-- The per-platform detail tables must likewise describe an account of that
-- platform, or x_account_detail could describe a GitHub account.
create or replace function signals.validate_detail_platform()
returns trigger
language plpgsql
as $$
declare
  required_platform text := tg_argv[0];
  acct_platform     text;
begin
  select platform into acct_platform
  from signals.platform_account where id = new.platform_account_id;

  if acct_platform is distinct from required_platform then
    raise exception
      '%.% describes a % account, got %',
      tg_table_schema, tg_table_name, required_platform,
      coalesce(acct_platform, 'missing account')
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function signals.validate_detail_platform() is
  'Generic guard: asserts a per-platform account detail row describes an account on that platform.';

create trigger x_account_detail_platform
  before insert or update of platform_account_id on signals.x_account_detail
  for each row execute function signals.validate_detail_platform('x');

create trigger github_account_detail_platform
  before insert or update of platform_account_id on signals.github_account_detail
  for each row execute function signals.validate_detail_platform('github');

create trigger youtube_channel_detail_platform
  before insert or update of platform_account_id on signals.youtube_channel_detail
  for each row execute function signals.validate_detail_platform('youtube');

create trigger linkedin_account_detail_platform
  before insert or update of platform_account_id on signals.linkedin_account_detail
  for each row execute function signals.validate_detail_platform('linkedin');

commit;
