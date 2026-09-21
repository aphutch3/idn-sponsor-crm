-- 128_platform_account_url.sql
--
-- signals.platform_account.url held two different facts. For 535 X accounts it
-- was the profile URL. For 3,182 it was a t.co shortlink -- the X API's `url`
-- field, which is the link a user puts in their bio, not their profile address.
-- The speakers app renders this column as the speaker's X link, so a third of
-- the roster linked to whatever site the person was promoting: Fei-Fei Li's
-- profile pointed at a t.co redirect instead of x.com/drfeifei. 24 speakers on
-- the live roster were affected.
--
-- The bio link is real data and is kept, in a column that says what it is. The
-- X profile URL is then backfilled from the handle, which is the identity the
-- platform guarantees.
--
-- url is deliberately NOT made a generated column. 180 of 1,051 LinkedIn
-- accounts have a URL that does not follow linkedin.com/in/<handle> -- company
-- pages, /pub/ paths, regional subdomains -- and deriving it would silently
-- replace 180 working links with broken ones. The defect is specific to how the
-- X loader read the API, so the fix is too.

begin;

alter table signals.platform_account add column website_url text;

comment on column signals.platform_account.website_url is
  'The link in the account bio, as the platform reports it. Usually a t.co or similar shortener; not the profile address.';
comment on column signals.platform_account.url is
  'Profile address on the platform. Must not hold the bio link -- see website_url.';

-- Move any value that is not a profile address on a known platform.
update signals.platform_account
   set website_url = url,
       url         = null
 where url is not null
   and url !~ '(x|twitter)\.com/|linkedin\.com/|github\.com/|youtube\.com/';

-- Backfill the X profile address from the handle, which is what identifies the
-- account. Only for rows with no url: an existing profile URL is left alone.
update signals.platform_account
   set url = 'https://x.com/' || handle
 where platform = 'x' and url is null and handle is not null and handle <> '';

alter table signals.platform_account add constraint platform_account_url_not_shortlink_ck
  check (url is null or url !~ '^https?://(t\.co|bit\.ly|lnkd\.in)/');

commit;
