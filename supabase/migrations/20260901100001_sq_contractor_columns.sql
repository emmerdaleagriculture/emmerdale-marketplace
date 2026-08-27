-- ============================================================================
-- Sealed-quote funnel: contractor registry additions + configuration.
--
-- The existing contractor registry IS the supply side for sealed quotes
-- (decided): vetting happened offline for everyone already approved, so
-- vetted_at backfills to now for them. contractors.services was never
-- collected — every row is '{}' — so matching on county AND service would
-- match nobody; decided: backfill all current services and let contractors
-- narrow from their account page (over-invitation self-corrects via the
-- decline data, spec §15).
--
-- app_config: the spec repeatedly demands configuration, not constants
-- (§16a expiry, §34 items 4/4a, markup rate). One key/value table, read by
-- the RPCs. sq_test_contractor_allowlist is the TEST MODE switch: while
-- non-empty, distribution only matches allowlisted contractor emails and
-- the mailer redirects contractor emails to the allowlist — real
-- contractors must never see test traffic. Go-live = set it to [].
-- ============================================================================

-- ── Contractor columns ──────────────────────────────────────────────────────
alter table contractors add column if not exists vetted_at    timestamptz;
alter table contractors add column if not exists rating_avg   numeric;
alter table contractors add column if not exists rating_count int not null default 0;
alter table contractors add column if not exists base_lat     numeric;  -- display-only distance,
alter table contractors add column if not exists base_lng     numeric;  -- never a filter (§15)

update contractors set vetted_at = now()
 where status = 'approved' and vetted_at is null;

update contractors
   set services = (select coalesce(array_agg(id order by id), '{}') from services)
 where services = '{}';

-- Fan-out joins on county — indexed now that invitations multiply the reads.
create index if not exists contractor_counties_county_idx on contractor_counties (county_id);

-- ── services.area_priced ────────────────────────────────────────────────────
-- Gates the £/acre rate-quote option (§26a.6): supply and hire aren't priced
-- off an acreage.
alter table services add column if not exists area_priced boolean not null default true;
update services set area_priced = false
 where name in ('Hay, straw & haylage', 'Tractor hire (events)');

-- ── app_config ──────────────────────────────────────────────────────────────
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security;

insert into app_config (key, value) values
  ('sq_job_expiry_days',           '7'),
  ('sq_client_quote_batch_hours',  '6'),
  ('sq_no_quotes_alert_hours',     '48'),
  ('sq_payment_link_expiry_hours', '24'),
  ('sq_markup_rate',               '0.10'),
  ('sq_composite_weight',          '0.3'),
  ('sq_test_contractor_allowlist', '["tom@hampshirepaddockmanagement.com"]')
on conflict (key) do nothing;

create or replace function app_config_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from app_config where key = p_key), p_default);
$$;
revoke execute on function app_config_num(text, numeric) from public;
grant execute on function app_config_num(text, numeric) to service_role;
