-- IDN Canonical Schema Contract v2 :: content domain integrity
-- Release candidate canonical-v2-content. Execute only through the guarded release runner.
--
-- Adds updated_at maintenance, normalization of the two deduplication keys, and
-- database-enforced existence for the polymorphic content_entity target.

begin;

-- ---------------------------------------------------------------------------
-- updated_at maintenance, following the established tg_<table>_updated convention
-- ---------------------------------------------------------------------------

drop trigger if exists tg_content_publication_updated on public.content_publication;
create trigger tg_content_publication_updated
before update on public.content_publication
for each row execute function public.tg_touch_updated_at();

drop trigger if exists tg_content_source_updated on public.content_source;
create trigger tg_content_source_updated
before update on public.content_source
for each row execute function public.tg_touch_updated_at();

drop trigger if exists tg_content_edition_updated on public.content_edition;
create trigger tg_content_edition_updated
before update on public.content_edition
for each row execute function public.tg_touch_updated_at();

drop trigger if exists tg_content_item_updated on public.content_item;
create trigger tg_content_item_updated
before update on public.content_item
for each row execute function public.tg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Deterministic normalization of deduplication keys
-- ---------------------------------------------------------------------------

create or replace function public.normalize_content_publication()
returns trigger
language plpgsql
as $$
begin
  new.normalized_domain := lower(
    regexp_replace(btrim(coalesce(new.domain, '')), '^www\.', '')
  );
  if length(new.normalized_domain) = 0 then
    raise exception 'content_publication.domain must normalize to a non-empty value'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_content_publication_normalize on public.content_publication;
create trigger tg_content_publication_normalize
before insert or update of domain on public.content_publication
for each row execute function public.normalize_content_publication();

create or replace function public.normalize_content_source()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := lower(
    btrim(regexp_replace(coalesce(new.name, ''), '[^a-zA-Z0-9]+', ' ', 'g'))
  );
  if length(new.normalized_name) = 0 then
    raise exception 'content_source.name must normalize to a non-empty value'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_content_source_normalize on public.content_source;
create trigger tg_content_source_normalize
before insert or update of name on public.content_source
for each row execute function public.normalize_content_source();

-- ---------------------------------------------------------------------------
-- Polymorphic target existence for content_entity
--
-- The approved entity kinds are fixed by a check constraint. This trigger proves
-- the referenced row actually exists, which a polymorphic column cannot express
-- as a foreign key. It mirrors meta.validate_bound_target.
-- ---------------------------------------------------------------------------

create or replace function public.validate_content_entity_target()
returns trigger
language plpgsql
as $$
declare
  target_relation text;
  target_exists boolean;
begin
  target_relation := case new.entity_table
    when 'person' then 'public.person'
    when 'company' then 'public.company'
    when 'tag' then 'public.tag'
    when 'event' then 'public.event'
    when 'session' then 'public.session'
    when 'content_item' then 'public.content_item'
  end;

  if target_relation is null then
    raise exception 'Unapproved content_entity target kind: %', new.entity_table
      using errcode = '23514';
  end if;

  execute format(
    'select true from %s where id = $1 for key share', target_relation
  ) into target_exists using new.entity_id;

  if target_exists is distinct from true then
    raise exception 'content_entity target does not exist: % %', new.entity_table, new.entity_id
      using errcode = '23503';
  end if;

  if new.entity_table = 'content_item' and new.entity_id = new.content_item_id then
    raise exception 'content_entity cannot relate a content item to itself'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists tg_content_entity_validate_target on public.content_entity;
create trigger tg_content_entity_validate_target
before insert or update of entity_table, entity_id on public.content_entity
for each row execute function public.validate_content_entity_target();

-- ---------------------------------------------------------------------------
-- content_metric is an append-only observation log
-- ---------------------------------------------------------------------------

create or replace function public.reject_content_metric_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'content_metric is append-only; insert a new observation instead'
    using errcode = '23514';
end;
$$;

drop trigger if exists tg_content_metric_append_only on public.content_metric;
create trigger tg_content_metric_append_only
before update or delete on public.content_metric
for each row execute function public.reject_content_metric_mutation();

comment on function public.normalize_content_publication() is
  'Derives content_publication.normalized_domain, the deduplication key for a hosting site.';
comment on function public.normalize_content_source() is
  'Derives content_source.normalized_name, the deduplication key for a publishing channel.';
comment on function public.validate_content_entity_target() is
  'Proves that a polymorphic content_entity target row exists among the approved entity kinds.';
comment on function public.reject_content_metric_mutation() is
  'Enforces the append-only contract on content_metric observations.';

commit;
