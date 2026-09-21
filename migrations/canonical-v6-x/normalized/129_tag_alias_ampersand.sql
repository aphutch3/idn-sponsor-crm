-- 129_tag_alias_ampersand.sql
--
-- signals.normalize_tag_alias() deleted every character outside [a-z0-9-], so
-- "R&D" normalised to "rd" -- which is also how the separate tag "Rd"
-- normalises. tag_alias_resolves_once then correctly refused to let one
-- normalised alias point at two tags, and the loader had to drop one. The
-- dropped alias was "R&D", so articles tagged "R&D" stopped resolving to the
-- "R And D" tag: it disappeared from the Security bucket on /api/tags/
-- categories and took 4 articles' tag attribution with it.
--
-- The collision is an artefact of the normaliser, not of the data. "&" is a
-- word, not punctuation -- "R&D" and "R and D" are the same tag, and neither is
-- "Rd". Expanding it to "and" before punctuation is stripped makes "R&D"
-- normalise to "r-and-d", which is the tag's own slug.
--
-- Verified against all 11 aliases containing "&" before applying: the
-- expansion introduces no new collision. m&a -> m-and-a, att&ck -> att-and-ck,
-- s&p 500 -> s-and-p-500, and each remains unique to its own tag.

begin;

create or replace function signals.normalize_tag_alias()
returns trigger language plpgsql as $function$
declare
  a text;
begin
  -- lowercase before collapsing, for the reason recorded in
  -- 65_fix_domain_normalization.sql.
  a := lower(btrim(coalesce(new.raw_alias, '')));
  -- "&" is a word. Expanding it before punctuation is stripped is what keeps
  -- "R&D" distinct from "Rd" -- deleting it merged them.
  a := replace(a, '&', ' and ');
  a := regexp_replace(a, '[\s_/]+', '-', 'g');   -- unify separators
  a := regexp_replace(a, '[^a-z0-9-]', '', 'g'); -- drop punctuation
  a := regexp_replace(a, '-+', '-', 'g');        -- collapse runs
  a := btrim(a, '-');

  if length(a) = 0 then
    raise exception 'tag alias must normalize to a non-empty value (got %)', new.raw_alias
      using errcode = '23514';
  end if;

  new.normalized_alias := a;
  return new;
end;
$function$;

-- Re-normalise the rows already stored. The BEFORE trigger recomputes the
-- column, so touching raw_alias is enough and cannot drift from the function.
update signals.tag_alias set raw_alias = raw_alias where raw_alias like '%&%';

commit;
