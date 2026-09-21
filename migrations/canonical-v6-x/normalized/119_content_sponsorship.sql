-- 119_content_sponsorship.sql
--
-- Newsletter sponsorship: a company's paid placement inside a newsletter
-- edition. This is a DIFFERENT fact from public.sponsorship, which already
-- exists and records a company sponsoring an EVENT (it is keyed by event_id and
-- carries tiers, contract dates and delivered leads). Reusing that table would
-- have forced event_id nullable and mixed two unrelated commercial
-- relationships under one name.
--
-- The sponsor itself is NOT a new entity. Legacy has a 212-row `sponsors` table
-- with name/domain/category, which is a company -- the same company the Engager
-- and the events platform already track. It resolves into public.company by
-- domain, exactly as the GitHub repo owners did, so a sponsor that also appears
-- as a summit prospect or a repo owner is one row rather than three.
--
-- Columns legacy carries that are NOT repeated here, because they are already
-- reachable and a second copy is free to disagree:
--   newsletter_id -> content_edition.content_source_id
--   issue_date    -> content_edition.edition_date

begin;

create table if not exists signals.content_sponsorship (
  id                  uuid primary key,
  company_id          uuid not null references public.company(id) on delete cascade,
  content_edition_id  uuid not null references public.content_edition(id) on delete cascade,
  -- The specific item the placement rendered as, when the source recorded one.
  -- Nullable: most placements are edition-level, not tied to one article.
  content_item_id     uuid references public.content_item(id) on delete set null,
  placement           text,
  headline            text,
  cta_url             text,
  created_at          timestamptz not null default now()
);

-- One placement per company per edition per slot. Legacy had no such
-- constraint, so this is asserted rather than assumed -- the load fails loudly
-- if the source actually holds duplicates instead of quietly creating them.
create unique index if not exists content_sponsorship_uk
  on signals.content_sponsorship
     (company_id, content_edition_id, coalesce(placement, ''));

create index if not exists content_sponsorship_company_ix
  on signals.content_sponsorship (company_id);
create index if not exists content_sponsorship_edition_ix
  on signals.content_sponsorship (content_edition_id);

comment on table signals.content_sponsorship is
  'A company''s paid placement in a newsletter edition. Event sponsorship is public.sponsorship; these are different commercial facts.';

commit;
