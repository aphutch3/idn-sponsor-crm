-- 71_account_triggers.sql  (release canonical-v3-signals)
--
-- Derivation and immutability guarantees for the account layer.
--
-- Handle normalization exists so that '@Aravind', 'aravind' and 'ARAVIND'
-- collapse to one account. This is the same defect class fixed in
-- 65_fix_domain_normalization.sql, so the order here is deliberate and
-- documented: strip decoration, THEN lowercase is wrong; lowercase FIRST, then
-- strip, because a pattern written in lowercase cannot match upper-case input.

begin;

-- ---------------------------------------------------------------------------
-- normalized_handle derivation
-- ---------------------------------------------------------------------------
create or replace function signals.normalize_platform_account()
returns trigger
language plpgsql
as $$
declare
  h text;
begin
  -- lowercase FIRST so the strip patterns below match regardless of input case.
  h := lower(btrim(coalesce(new.handle, '')));

  -- A handle is frequently captured as a full profile URL or an @-mention.
  -- Reduce all of those spellings to the bare handle.
  h := regexp_replace(h, '^https?://', '');
  h := regexp_replace(h, '^(www\.)?(x\.com|twitter\.com|github\.com|linkedin\.com|youtube\.com)/', '');
  h := regexp_replace(h, '^(in|company|c|channel|user)/', '');  -- linkedin/youtube path prefixes
  h := regexp_replace(h, '^@', '');
  h := regexp_replace(h, '[/?#].*$', '');                       -- trailing path, query, fragment
  h := btrim(h);

  if length(h) = 0 then
    raise exception 'platform_account.handle must normalize to a non-empty value (got %)', new.handle
      using errcode = '23514';
  end if;

  new.normalized_handle := h;
  return new;
end;
$$;

comment on function signals.normalize_platform_account() is
  'Derives normalized_handle: lowercase first, then strip scheme, known host prefixes, path prefixes, @ and trailing path. Lowercasing must precede stripping or upper-cased input escapes the patterns.';

create trigger platform_account_normalize
  before insert or update of handle on signals.platform_account
  for each row execute function signals.normalize_platform_account();

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuses the canonical helper)
-- ---------------------------------------------------------------------------
create trigger platform_account_touch
  before update on signals.platform_account
  for each row execute function public.tg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- account_metric is append-only
-- ---------------------------------------------------------------------------
-- An observation that can be edited is not an observation. Correcting history
-- means appending a new row at a new observed_at, never mutating the old one.
create or replace function signals.reject_account_metric_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'signals.account_metric is append-only; % is not permitted. Append a new observation instead.',
    tg_op
    using errcode = '23514';
end;
$$;

comment on function signals.reject_account_metric_mutation() is
  'Enforces append-only semantics on signals.account_metric by rejecting UPDATE and DELETE.';

create trigger account_metric_no_update
  before update on signals.account_metric
  for each row execute function signals.reject_account_metric_mutation();

create trigger account_metric_no_delete
  before delete on signals.account_metric
  for each row execute function signals.reject_account_metric_mutation();

-- ---------------------------------------------------------------------------
-- Identity promotion consistency
-- ---------------------------------------------------------------------------
-- If this row claims a canonical handle (person_handle_id), then that handle
-- must belong to the same person this row claims, and must be for the same
-- platform. Without this check the two nullable upward links could disagree —
-- an account could point at person A while mirroring a canonical handle owned
-- by person B, and every downstream attribution would inherit the conflict.
create or replace function signals.validate_account_identity()
returns trigger
language plpgsql
as $$
declare
  h_person   uuid;
  h_platform text;
begin
  if new.person_handle_id is null then
    return new;
  end if;

  select person_id, platform into h_person, h_platform
  from public.person_handle
  where id = new.person_handle_id;

  if h_person is null then
    raise exception 'platform_account.person_handle_id % does not exist', new.person_handle_id
      using errcode = '23503';
  end if;

  -- Mirroring a canonical handle without naming the person is an incomplete
  -- promotion; adopt the canonical person rather than leaving the row split.
  if new.person_id is null then
    new.person_id := h_person;
  elsif new.person_id <> h_person then
    raise exception
      'platform_account person_id % disagrees with person_handle % owner %',
      new.person_id, new.person_handle_id, h_person
      using errcode = '23514';
  end if;

  if h_platform <> new.platform then
    raise exception
      'platform_account platform % cannot mirror a % person_handle',
      new.platform, h_platform
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function signals.validate_account_identity() is
  'Keeps the two nullable identity links consistent: a mirrored person_handle must be same-platform and same-person, and adopts the canonical person when person_id was left null.';

create trigger platform_account_identity
  before insert or update of person_id, person_handle_id, platform
  on signals.platform_account
  for each row execute function signals.validate_account_identity();

commit;
