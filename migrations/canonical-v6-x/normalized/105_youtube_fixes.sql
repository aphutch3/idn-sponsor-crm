-- 105_youtube_fixes.sql
--
-- Corrects signals.content_youtube_video.ingest_depth before any YouTube data
-- is loaded against it.
--
-- The column was declared integer, but `depth` is not a number: it is an
-- ordered ENRICHMENT TIER. A cheap listing pass writes 'title'; a Data API
-- pass upgrades the row to 'meta' (ytsync/transform.py). ytsync/store.py is
-- explicit that a richer depth "must never be clobbered by a later listing
-- pass", so the ordering is a real invariant rather than a label.
--
-- An enum rather than text: the ordering is what the invariant is about, and
-- Postgres orders enum values by declaration, so 'title' < 'meta' is true in
-- the type itself. That makes the guard below a plain comparison, and a typo
-- in a future ingest fails instead of silently becoming a third tier.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'youtube_ingest_depth') then
    create type signals.youtube_ingest_depth as enum ('title', 'meta');
  end if;
end $$;

alter table signals.content_youtube_video
  drop column if exists ingest_depth;

alter table signals.content_youtube_video
  add column ingest_depth signals.youtube_ingest_depth;

comment on column signals.content_youtube_video.ingest_depth is
  'Enrichment tier reached for this video. Ordered: title < meta. Never downgrade -- see yt_video_no_depth_downgrade.';

-- Enforce the invariant the ingester documents but could not previously rely
-- on, so a listing pass cannot silently discard Data API enrichment.
create or replace function signals.reject_youtube_depth_downgrade()
returns trigger
language plpgsql
as $$
begin
  if old.ingest_depth is not null
     and new.ingest_depth is not null
     and new.ingest_depth < old.ingest_depth then
    raise exception
      'ingest_depth cannot be downgraded (% -> %) for video %',
      old.ingest_depth, new.ingest_depth, old.video_id
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists yt_video_no_depth_downgrade on signals.content_youtube_video;
create trigger yt_video_no_depth_downgrade
  before update on signals.content_youtube_video
  for each row execute function signals.reject_youtube_depth_downgrade();

commit;
