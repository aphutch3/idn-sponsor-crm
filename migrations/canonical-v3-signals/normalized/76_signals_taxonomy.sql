-- 76_signals_taxonomy.sql  (release canonical-v3-signals)
--
-- The Signals working tag space.
--
-- TWO TAG SPACES, DELIBERATELY
-- ----------------------------
-- public.tag holds 27 curated, cross-app canonical tags. The Signals app
-- observes ~11,000 machine-extracted tags with 12,375 aliases. Those are
-- candidate vocabulary, not canonical truth, and the app's contract grants it
-- `read` on public.tag and `propose` on entity_tag — never `write`.
--
-- So the working space lives here, and canonical_tag_id is the promotion link:
-- NULL means "not promoted", never "not a real tag". Promotion is reviewed.
-- This is the same shape as signals.platform_account -> public.person.

begin;

create type signals.tag_merge_status as enum ('open','accepted','rejected','superseded');

-- ---------------------------------------------------------------------------
-- tag
-- ---------------------------------------------------------------------------
create table signals.tag (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  display_name     text not null,
  description      text,
  color            text,

  parent_id        uuid references signals.tag(id) on delete set null,
  canonical_tag_id uuid references public.tag(id) on delete set null,

  is_curated       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint tag_slug_ck check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  -- A tag cannot be its own parent. Deeper cycles are prevented by trigger.
  constraint tag_parent_ck check (parent_id is distinct from id)
);

create index tag_parent_ix on signals.tag (parent_id) where parent_id is not null;

-- Which working tags have been promoted, and to what.
create index tag_canonical_ix on signals.tag (canonical_tag_id)
  where canonical_tag_id is not null;

-- The curated subset is browsed on its own.
create index tag_curated_ix on signals.tag (display_name) where is_curated;

-- Type-ahead over 11k tags.
create index tag_name_trgm_ix on signals.tag
  using gin (display_name public.gin_trgm_ops);

comment on table signals.tag is
  'Signals working tag vocabulary (~11k machine-extracted). canonical_tag_id links to the 27 curated public.tag rows once promoted; NULL means not yet promoted, not invalid.';

-- Hierarchy cycles corrupt every recursive rollup that walks parents. The
-- single-row CHECK above only catches self-parenting, so walk the chain.
create or replace function signals.validate_tag_hierarchy()
returns trigger
language plpgsql
as $$
declare
  cursor_id uuid := new.parent_id;
  depth     integer := 0;
begin
  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'signals.tag hierarchy cycle via parent %', new.parent_id
        using errcode = '23514';
    end if;
    depth := depth + 1;
    if depth > 32 then
      raise exception 'signals.tag hierarchy deeper than 32 levels'
        using errcode = '23514';
    end if;
    select parent_id into cursor_id from signals.tag where id = cursor_id;
  end loop;
  return new;
end;
$$;

comment on function signals.validate_tag_hierarchy() is
  'Rejects parent chains that revisit the row (cycle) or exceed 32 levels, which would make recursive tag rollups non-terminating.';

create trigger tag_hierarchy
  before insert or update of parent_id on signals.tag
  for each row when (new.parent_id is not null)
  execute function signals.validate_tag_hierarchy();

create trigger tag_touch
  before update on signals.tag
  for each row execute function public.tg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- tag_alias
-- ---------------------------------------------------------------------------
-- Raw extracted strings that resolve to a working tag. normalized_alias is the
-- dedupe key so 'LLMs', 'llms' and ' LLMs ' cannot become three aliases.
create table signals.tag_alias (
  id               uuid primary key default gen_random_uuid(),
  tag_id           uuid not null references signals.tag(id) on delete cascade,
  raw_alias        text not null,
  normalized_alias text not null,
  confidence       numeric(4,3),
  source_system    text references public.source_system(code),
  created_at       timestamptz not null default now(),

  constraint tag_alias_confidence_ck
    check (confidence is null or confidence between 0 and 1)
);

-- One resolution per alias string. Two working tags claiming the same alias is
-- an unresolvable ambiguity at read time, so it is rejected at write time.
create unique index tag_alias_normalized_uk on signals.tag_alias (normalized_alias);

create index tag_alias_tag_ix on signals.tag_alias (tag_id);

comment on table signals.tag_alias is
  'Raw extracted strings resolving to a working tag. normalized_alias is globally unique: one alias cannot resolve to two tags.';

create or replace function signals.normalize_tag_alias()
returns trigger
language plpgsql
as $$
declare
  a text;
begin
  -- lowercase before collapsing, for the reason recorded in
  -- 65_fix_domain_normalization.sql.
  a := lower(btrim(coalesce(new.raw_alias, '')));
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
$$;

comment on function signals.normalize_tag_alias() is
  'Derives normalized_alias: lowercase, unify separators to hyphen, strip punctuation, collapse and trim hyphens.';

create trigger tag_alias_normalize
  before insert or update of raw_alias on signals.tag_alias
  for each row execute function signals.normalize_tag_alias();

-- ---------------------------------------------------------------------------
-- tag_daily_stat  (derived)
-- ---------------------------------------------------------------------------
create table signals.tag_daily_stat (
  tag_id         uuid not null references signals.tag(id) on delete cascade,
  day            date not null,
  article_count  integer not null default 0,
  avg_importance numeric,
  sentiment_pos  integer not null default 0,
  sentiment_neu  integer not null default 0,
  sentiment_neg  integer not null default 0,
  computed_at    timestamptz not null default now(),

  primary key (tag_id, day),

  constraint tag_daily_stat_counts_ck check (
    article_count >= 0 and sentiment_pos >= 0
    and sentiment_neu >= 0 and sentiment_neg >= 0
    -- Sentiment buckets partition the articles counted; they cannot exceed it.
    and sentiment_pos + sentiment_neu + sentiment_neg <= article_count
  )
);

-- Trend charts scan a date range across many tags.
create index tag_daily_stat_day_ix on signals.tag_daily_stat (day desc, article_count desc);

comment on table signals.tag_daily_stat is
  'Derived daily tag rollup. Sentiment buckets are constrained to partition article_count, so a rebuild bug cannot publish impossible totals.';

-- ---------------------------------------------------------------------------
-- tag_cooccurrence  (derived, unordered pair)
-- ---------------------------------------------------------------------------
-- A co-occurrence is an UNORDERED pair: (A,B) and (B,A) are the same fact.
-- The source stores the pair without that constraint, so the same relationship
-- can exist twice with two different counts and no rule says which is right.
--
-- Requiring tag_a < tag_b makes the duplicate unrepresentable: the pair has
-- exactly one spelling, enforced by the primary key.
create table signals.tag_cooccurrence (
  tag_a         uuid not null references signals.tag(id) on delete cascade,
  tag_b         uuid not null references signals.tag(id) on delete cascade,
  cooccurrences integer not null,
  last_seen_at  timestamptz,
  computed_at   timestamptz not null default now(),

  primary key (tag_a, tag_b),

  constraint tag_cooccurrence_order_ck check (tag_a < tag_b),
  constraint tag_cooccurrence_count_ck check (cooccurrences > 0)
);

-- The pair is stored once, so lookups from the second tag need this index.
create index tag_cooccurrence_b_ix on signals.tag_cooccurrence (tag_b, cooccurrences desc);
create index tag_cooccurrence_a_ix on signals.tag_cooccurrence (tag_a, cooccurrences desc);

comment on table signals.tag_cooccurrence is
  'Derived unordered tag pair counts. CHECK (tag_a < tag_b) makes the mirrored duplicate unrepresentable, so a pair has exactly one row and one count.';

-- ---------------------------------------------------------------------------
-- tag_merge_suggestion
-- ---------------------------------------------------------------------------
create table signals.tag_merge_suggestion (
  id            uuid primary key default gen_random_uuid(),
  from_tag_id   uuid not null references signals.tag(id) on delete cascade,
  into_tag_id   uuid not null references signals.tag(id) on delete cascade,
  reason        text,
  score         numeric(4,3),
  status        signals.tag_merge_status not null default 'open',
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,

  constraint tag_merge_distinct_ck check (from_tag_id <> into_tag_id),
  constraint tag_merge_score_ck check (score is null or score between 0 and 1),
  constraint tag_merge_decided_ck
    check ((status = 'open') = (decided_at is null))
);

-- At most one open suggestion per direction; history is preserved by allowing
-- repeats once decided.
create unique index tag_merge_open_uk
  on signals.tag_merge_suggestion (from_tag_id, into_tag_id)
  where status = 'open';

create index tag_merge_queue_ix
  on signals.tag_merge_suggestion (score desc nulls last)
  where status = 'open';

comment on table signals.tag_merge_suggestion is
  'Proposed tag merges awaiting review. One open suggestion per ordered pair; decided rows retain history.';

commit;
