-- ============================================================================
-- Landing page view tracking (first-party).
--
-- The reporting dashboard needs the top of the funnel — paid clicks that
-- reached /start — and nothing server-side records that today. One row per
-- pageview, beaconed from the page after hydration (so it counts humans with
-- JS, i.e. the traffic ads actually bill for), carrying the attribution
-- params. Everything downstream (parses, confirms) is already logged in
-- job_parse_events / job_submissions; this completes view → parse → confirm.
-- ============================================================================

create table if not exists landing_views (
  id           bigserial primary key,
  path         text not null default '/start',
  ip           text,
  referrer     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  gclid        text,
  created_at   timestamptz not null default now()
);
create index if not exists landing_views_created_idx on landing_views (created_at);

-- RLS on, no policies → service-role only, like the other funnel tables.
alter table landing_views enable row level security;
