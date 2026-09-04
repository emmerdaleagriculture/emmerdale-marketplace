-- ============================================================================
-- Where people look and where they leave.
--
-- landing_views counts arrivals on /start and nothing else — the home page
-- records nothing at all, and no page records what anyone did once they were
-- on it. This is the raw material for both: click positions for a heat
-- overlay, and furthest scroll depth per visit.
--
-- Deliberately not a person: no IP, no user id, no fingerprint. session_key is
-- a random per-tab string that exists only to stop one visitor's ten clicks
-- reading as ten visitors, and it means nothing outside its own tab. Positions
-- are fractions of the document, not pixels, so a phone and a desktop land in
-- the same coordinate space.
-- ============================================================================

create table if not exists page_events (
  id          bigint generated always as identity primary key,
  path        text not null,
  kind        text not null check (kind in ('click', 'depth')),
  session_key text not null,
  -- click: position as a fraction of document width/height (0..1)
  x_pct       numeric(6, 4),
  y_pct       numeric(6, 4),
  -- depth: furthest point of the document reached, 0..100
  depth_pct   int check (depth_pct between 0 and 100),
  viewport_w  int,
  doc_h       int,
  -- Nearest meaningful thing clicked, for a plain-language ranking alongside
  -- the overlay. Never free text from the page — a short label the tracker
  -- derives from the element itself.
  label       text,
  created_at  timestamptz not null default now()
);

create index if not exists page_events_path_created_idx on page_events (path, created_at desc);
create index if not exists page_events_session_idx on page_events (session_key);

-- Service role only: nothing here is world-readable and nothing needs to be.
alter table page_events enable row level security;

-- Behavioural crumbs have no value once they're old, and this is the one table
-- that grows with traffic rather than with business. Ninety days, pruned daily.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-page-events') then
    perform cron.unschedule('prune-page-events');
  end if;
  perform cron.schedule(
    'prune-page-events',
    '17 3 * * *',
    $pp$delete from page_events where created_at < now() - interval '90 days';$pp$
  );
end $$;
