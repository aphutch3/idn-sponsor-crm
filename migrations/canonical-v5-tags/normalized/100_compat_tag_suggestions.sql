-- 100_compat_tag_suggestions.sql
--
-- compat.tag_merge_suggestion -- the editor's open merge queue, shaped like
-- the legacy table so /api/tags/suggestions keeps working.
--
-- Two translations happen here.
--
-- STATUS VOCABULARY. Legacy status is free text and holds exactly one value,
-- 'pending'. Canonical uses the enum signals.tag_merge_status
-- (open|accepted|rejected|superseded), because a status column with no
-- vocabulary is how you end up with 'pending', 'Pending' and 'open' meaning
-- the same thing. 'open' is the equivalent label and maps back to 'pending'
-- here. The other three labels have no legacy spelling; they are projected
-- under their own names rather than being folded into 'pending', so a decided
-- suggestion can never masquerade as an undecided one. The app only ever asks
-- for status=eq.pending, so decided rows simply drop out of its queue, which
-- is the intended behaviour.
--
-- IDENTITY. Legacy ids are a serial (1..25); canonical ids are uuid. Rows
-- imported from legacy project their original integer through external_ref,
-- so ids the editor has seen stay stable.
--
-- Suggestions RAISED BY THE CANONICAL LOAD have no legacy integer. They are
-- given a negative id derived from the uuid. Negative ids cannot collide with
-- a serial sequence, and the sign makes their origin visible at a glance.
-- This endpoint is read-only (routes.ts ~2200, no write path), so a synthetic
-- id is never sent back to the database.
--
-- Projecting those rows at all is a deliberate choice. The compat view mostly
-- emulates the legacy table, but this table is a live work queue: hiding a
-- real merge candidate because it was found after the cutover would quietly
-- shrink the editor's queue. There is currently exactly one such row -- the
-- 'r&d'/'rd' normalisation collision described in 98_compat_tags.sql -- and
-- it is scored 1.0, so it sorts first under the endpoint's order=score.desc.

create or replace view compat.tag_merge_suggestion as
select
    coalesce(
        (split_part(x.external_id, ':', 2))::int,
        -- Stable, negative, and comfortably clear of any serial value.
        -- abs() is applied to the modulus, not to hashtext() itself, because
        -- abs(-2147483648) overflows int.
        -(abs(hashtext(m.id::text) % 1000000000) + 1000000)
    )                                        as id,
    ft.legacy_id                             as from_canonical,
    it.legacy_id                             as into_canonical,
    m.score,
    m.reason,
    case m.status
        when 'open' then 'pending'
        else m.status::text
    end                                      as status,
    m.created_at
from signals.tag_merge_suggestion m
join compat._tag_id ft on ft.tag_id = m.from_tag_id
join compat._tag_id it on it.tag_id = m.into_tag_id
left join public.external_ref x
       on x.entity_table = 'tag_merge_suggestion'
      and x.entity_id    = m.id
      and x.source_system = 'news_dashboard';
