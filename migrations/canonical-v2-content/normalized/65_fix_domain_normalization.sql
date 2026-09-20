-- 65_fix_domain_normalization.sql
--
-- Defect fix for normalize_content_publication() as shipped in
-- 62_content_triggers.sql.
--
-- The original body stripped the leading 'www.' BEFORE lowercasing:
--
--     new.normalized_domain := lower(
--       regexp_replace(btrim(coalesce(new.domain,'')), '^www\.', ''));
--
-- The pattern '^www\.' is lowercase, so an input of 'WWW.Example.COM' did not
-- match and survived as 'www.example.com', while 'example.com' normalized to
-- 'example.com'. Those are different values, so the unique index on
-- normalized_domain treated one publication as two and deduplication silently
-- failed for any source that upper-cased the host.
--
-- Correct order is: trim, lowercase, THEN strip the www prefix. This also
-- strips a trailing dot (the fully-qualified DNS root form, 'example.com.')
-- and any trailing slash, both of which appear in scraped hrefs and would
-- otherwise fork the same domain into separate rows.
--
-- Forward-only and idempotent. There is no backfill clause because the
-- normalized value is trigger-derived; the UPDATE at the end re-fires the
-- trigger for every existing row, so a repaired key is applied to data loaded
-- before this migration ran.

begin;

create or replace function public.normalize_content_publication()
returns trigger
language plpgsql
as $$
declare
  d text;
begin
  -- trim, then lowercase, then strip prefixes/suffixes. Order matters.
  d := lower(btrim(coalesce(new.domain, '')));
  d := regexp_replace(d, '/+$', '');        -- trailing slash from href forms
  d := regexp_replace(d, '\.$', '');        -- fully-qualified DNS root form
  d := regexp_replace(d, '^www\.', '');     -- common subdomain, not a distinct site

  if length(d) = 0 then
    raise exception 'content_publication.domain must normalize to a non-empty value'
      using errcode = '23514';
  end if;

  -- A host with no dot is not a publication domain. Without this, an input of
  -- 'www.' alone normalized to the meaningless key 'www' and was accepted,
  -- which would then collide with every other malformed input of that shape.
  -- Verified against the 2118 live source_publications rows: every one contains
  -- a dot, so this rejects only genuinely malformed input.
  if position('.' in d) = 0 then
    raise exception 'content_publication.domain must contain a dot, got %', d
      using errcode = '23514';
  end if;

  new.normalized_domain := d;
  return new;
end;
$$;

comment on function public.normalize_content_publication() is
  'Derives content_publication.normalized_domain: trim, lowercase, then strip trailing slash, trailing dot and leading www. Order is load-bearing; stripping before lowercasing fails on upper-cased hosts.';

-- Re-derive the key for any rows loaded under the defective function.
-- No-op on an empty table. Safe to re-run.
--
-- If two rows were loaded that now normalize to the same domain (e.g. a
-- 'WWW.Example.com' row and an 'example.com' row), the unique index raises and
-- this migration aborts. That is deliberate: those rows are a genuine duplicate
-- that needs a reviewed merge, and silently collapsing them would destroy the
-- distinction between their child content_items.
update public.content_publication set domain = domain;

commit;
