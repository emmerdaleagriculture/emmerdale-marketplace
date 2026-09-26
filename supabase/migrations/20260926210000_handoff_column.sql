-- Which of our pages handed the visitor to /start (home, service, paddock),
-- kept apart from where they came from.
--
-- Until now the hand-off WAS the source: an internal link carries no utm
-- tags, so /start recorded `site:home` and the Facebook or Google click
-- behind it was lost. The source now comes from the tab's first touch, and
-- this column keeps the hand-off, so "Facebook via the homepage" and
-- "Facebook straight to /start" can still be compared.
alter table landing_views   add column if not exists handoff text;
alter table job_submissions add column if not exists handoff text;

comment on column landing_views.handoff is
  'Our page that sent the visitor to /start (the `src` param), or null for a direct arrival.';
comment on column job_submissions.handoff is
  'Our page that sent the customer to /start (the `src` param), or null for a direct arrival.';
