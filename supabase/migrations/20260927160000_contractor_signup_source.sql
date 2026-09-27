-- Where a contractor came from when they signed up.
--
-- /paddock-care is a recruitment page for contractors who work small sites,
-- run from its own ad campaign. Nothing recorded where a contractor came
-- from, so a campaign aimed at them could not be judged. The sign-up form now
-- carries the tab's first touch (utm tags, gclid, external referrer) and the
-- landing page that sent them; it rides on the auth user's metadata until
-- onboarding creates this row, which may be another day on another device.
--
-- jsonb: {utm_source, utm_medium, utm_campaign, gclid, referrer, landing}.
-- Null for everyone who signed up before 2026-09-27.

alter table contractors
  add column if not exists signup_source jsonb;

comment on column contractors.signup_source is
  'Attribution captured at sign-up: utm_source/utm_medium/utm_campaign, gclid, external referrer and the landing page (e.g. /paddock-care). Null before 2026-09-27.';
