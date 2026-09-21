-- 107_metric_kind_video.sql
--
-- Adds the 'video' metric kind.
--
-- yt_channels.video_count is "how many videos this channel has published",
-- which is a counter X/YouTube reports about the ACCOUNT and changes over
-- time -- the same shape as follower or subscriber. It is not the count of
-- video rows we happen to hold; that is derivable and stays derived.
--
-- The column is NULL on all 50 legacy channels today, so nothing is loaded
-- yet. The kind exists so the Data API pass has somewhere correct to put it
-- rather than inventing a column later.

alter type public.content_metric_kind add value if not exists 'video';
