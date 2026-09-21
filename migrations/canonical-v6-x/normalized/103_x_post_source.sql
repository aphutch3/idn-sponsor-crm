-- 103_x_post_source.sql
--
-- How a post entered the corpus. Legacy x_posts.sources was a text[] and the
-- Posts tab filters on it (`&sources=cs.{list}`), so it is real, load-bearing
-- data rather than provenance trivia.
--
-- Normalized to a child table instead of carried across as an array: the
-- attribute is genuinely multi-valued (2 of 3027 posts carry two sources), and
-- a child row per source is the form that indexes, constrains to a vocabulary,
-- and joins. The compat view folds it back into a text[] so the legacy filter
-- keeps working unchanged.

begin;

create table if not exists signals.x_post_source (
  content_item_id uuid not null
    references public.content_item (id) on delete cascade,
  source          text not null,
  constraint x_post_source_pk primary key (content_item_id, source),
  -- The observed vocabulary, constrained rather than free text so a typo in a
  -- future ingest fails loudly instead of quietly creating an unfilterable
  -- category.
  constraint x_post_source_vocab_ck
    check (source in ('list', 'search', 'account', 'bookmark', 'timeline'))
);

-- Supports the Posts tab filter, which selects posts BY source.
create index if not exists x_post_source_source_idx
  on signals.x_post_source (source, content_item_id);

commit;
