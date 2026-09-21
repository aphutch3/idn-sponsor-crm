-- 123_sponsorship_creative_key.sql
--
-- Widens the sponsorship unique key to include the creative.
--
-- 119 keyed a placement on (company, edition, placement slot), which asserts a
-- sponsor can appear at most once per slot per edition. It can't: 20 groups in
-- the source break it, and in every one of those 20 the rows carry DIFFERENT
-- headlines or different click-through URLs. A sponsor running two creatives in
-- one edition is two placements -- two things that were separately sold, served
-- and clicked -- and collapsing them undercounts the sponsor's activity. Under
-- the old key 26 real placements were dropped, and the sponsors it hit were the
-- heaviest advertisers: ref.wisprflow.ai fell from 23 appearances to 12.
--
-- The creative is what distinguishes them, so the creative belongs in the key.
-- On the full tuple there are zero duplicate rows in the source, so this key
-- admits every placement while still refusing a genuine double-load.
--
-- COALESCE, not the bare columns: in a unique index NULL never equals NULL, so
-- a nullable headline would let unlimited rows through and the constraint would
-- stop meaning anything precisely where the data is thinnest.

begin;

drop index if exists signals.content_sponsorship_uk;

create unique index content_sponsorship_uk
    on signals.content_sponsorship (
         company_id,
         content_edition_id,
         coalesce(placement, ''),
         coalesce(headline, ''),
         coalesce(cta_url, '')
       );

comment on index signals.content_sponsorship_uk is
  'A placement is one company, one edition, one slot, one creative. The creative is part of the identity: sponsors run two headlines in the same slot and each is a separately sold placement.';

commit;
