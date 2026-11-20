-- Heartbeat (2026-11-20): every 15 minutes /api/cron/heartbeat runs a set of
-- checks (each scheduled job, the email / SMS / push queues, Books receipts,
-- invoice PDFs, Stripe and Resend keys, the site itself) and writes one row
-- per check here. /admin/errors shows the latest of each; a check that turns
-- bad is also sent to Sentry. Kept 14 days (pruned by the heartbeat itself).
create table if not exists public.heartbeat_results (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  checked_at timestamptz not null default now(),
  check_name text not null,
  ok boolean not null,
  detail text,
  ms integer
);
create index if not exists heartbeat_results_check_idx on public.heartbeat_results (check_name, checked_at desc);
create index if not exists heartbeat_results_at_idx on public.heartbeat_results (checked_at);

-- Rows on /admin/errors that someone has dealt with. A row is hidden while
-- its latest occurrence is no newer than acked_at, so it comes back by itself
-- if the same thing happens again. Sentry issues are resolved in Sentry
-- instead; this is for the page's own tables (refusals, email, payments).
create table if not exists public.admin_error_acks (
  section text not null check (section in ('refusal', 'email', 'payment')),
  key text not null,
  acked_at timestamptz not null default now(),
  acked_by text,
  primary key (section, key)
);

alter table public.heartbeat_results enable row level security;
alter table public.admin_error_acks enable row level security;
revoke all on public.heartbeat_results, public.admin_error_acks from public, anon, authenticated;
grant all on public.heartbeat_results, public.admin_error_acks to service_role;
