-- ============================================================================
-- Priority Access, run in the shadows.
--
-- The long-term problem is work leaving the platform: a contractor and a
-- customer who met through us and then arranged it between themselves. The
-- proposed answer is a standing that is earned by booking through us and
-- lost by trying not to: Priority contractors see a new job in their area
-- first, Responsive ones next, everyone else when the window opens.
--
-- Nothing here changes who is invited or when. It computes what the scheme
-- WOULD do and records it beside what actually happened, so that before a
-- single contractor is told about it we know: how many would qualify in
-- each county, whether holding a job back for a day would have cost it its
-- first price, and whether the bookings we do get come from the contractors
-- the scheme would favour. /admin/priority reads it.
--
-- Three tables:
--   platform_flags       — a refused note or message (contact details before
--                          award, or paying some other way). Until now the
--                          only record was an email to the admin.
--   contractor_standing  — one row per contractor per night: the tier, and
--                          every figure that decided it. History kept.
--   priority_shadow      — one row per distributed job: who would have been
--                          in each window, then how the job actually went.
-- ============================================================================

-- ── Tunables (shadow only; nothing reads them on the live path) ─────────
insert into app_config (key, value) values
  ('sq_priority_won_days',        '180'),  -- a booking this recent keeps Priority
  ('sq_priority_priced_min',      '3'),    -- prices in the period for Responsive…
  ('sq_priority_priced_days',     '60'),
  ('sq_priority_response_hours',  '24'),   -- …with a median time-to-price under this
  ('sq_priority_clean_days',      '90'),   -- a flag this recent costs the standing
  ('sq_priority_window_hours',    '24'),   -- Responsive would see the job after this
  ('sq_responsive_window_hours',  '48')    -- everyone else after this
on conflict (key) do nothing;

-- ── A refusal, recorded ─────────────────────────────────────────────────
create table if not exists platform_flags (
  id            bigserial primary key,
  submission_id uuid references job_submissions(id) on delete cascade,
  contractor_id uuid references contractors(id) on delete set null,
  sender        text not null check (sender in ('contractor', 'customer')),
  surface       text not null,  -- 'message' | 'quote note' | 'extra-work proposal'
  -- Which rule refused it. The words themselves are never stored.
  rule          text not null check (rule in ('off_platform', 'phone', 'email_or_link', 'postcode')),
  created_at    timestamptz not null default now()
);
create index if not exists platform_flags_contractor_idx on platform_flags (contractor_id, created_at);
create index if not exists platform_flags_created_idx on platform_flags (created_at);
alter table platform_flags enable row level security;
revoke all on platform_flags from public, anon, authenticated;
grant all on platform_flags to service_role;

-- ── Standing ────────────────────────────────────────────────────────────
create table if not exists contractor_standing (
  id              bigserial primary key,
  contractor_id   uuid not null references contractors(id) on delete cascade,
  computed_on     date not null,
  tier            text not null check (tier in ('priority', 'responsive', 'standard')),
  won             int not null,       -- bookings through the platform in the won window
  priced          int not null,       -- jobs priced in the priced window
  median_hours    numeric,            -- median hours from invitation to first price
  flags           int not null,       -- platform_flags in the clean window
  rejected_msgs   int not null,       -- messages a moderator refused
  moderated       boolean not null,   -- under message moderation at any point in the window
  clean           boolean not null,
  reasons         text[] not null,    -- what decided it, in words
  computed_at     timestamptz not null default now(),
  unique (contractor_id, computed_on)
);
alter table contractor_standing enable row level security;
revoke all on contractor_standing from public, anon, authenticated;
grant all on contractor_standing to service_role;

-- The current standing of every contractor who has one.
create or replace view contractor_standing_latest as
  select distinct on (contractor_id) *
    from contractor_standing
   order by contractor_id, computed_on desc;
revoke all on contractor_standing_latest from public, anon, authenticated;
grant select on contractor_standing_latest to service_role;

-- The tier a contractor held on a given day: the latest standing computed on
-- or before it, 'standard' when none was.
create or replace function sq_tier_on(p_contractor_id uuid, p_day date) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select tier from contractor_standing
                    where contractor_id = p_contractor_id and computed_on <= p_day
                    order by computed_on desc limit 1), 'standard')
$$;

-- Tonight's standing for everyone approved and vetted.
create or replace function sq_standing_compute(p_on date default (now() at time zone 'Europe/London')::date)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r            record;
  v_won_days   int     := app_config_num('sq_priority_won_days', 180)::int;
  v_pr_min     int     := app_config_num('sq_priority_priced_min', 3)::int;
  v_pr_days    int     := app_config_num('sq_priority_priced_days', 60)::int;
  v_resp_h     numeric := app_config_num('sq_priority_response_hours', 24);
  v_clean_days int     := app_config_num('sq_priority_clean_days', 90)::int;
  v_tier       text;
  v_clean      boolean;
  v_reasons    text[];
  v_counts     jsonb := '{"priority":0,"responsive":0,"standard":0}';
begin
  for r in
    select ct.id,
      (select count(*) from job_submissions js
        where js.awarded_contractor_id = ct.id
          and js.awarded_at > p_on - v_won_days) as won,
      (select count(distinct cq.submission_id) from client_quotes cq
        where cq.contractor_id = ct.id
          and cq.created_at > p_on - v_pr_days) as priced,
      (select percentile_cont(0.5) within group (order by hrs)
         from (select (extract(epoch from min(cq.created_at) - ji.sent_at) / 3600)::numeric as hrs
                 from client_quotes cq
                 join job_invitations ji on ji.submission_id = cq.submission_id
                                        and ji.contractor_id = cq.contractor_id
                where cq.contractor_id = ct.id and cq.created_at > p_on - v_pr_days
                group by ji.id, ji.sent_at) t)::numeric as median_hours,
      (select count(*) from platform_flags f
        where f.contractor_id = ct.id and f.created_at > p_on - v_clean_days) as flags,
      (select count(*) from job_messages m
         join job_invitations ji on ji.id = m.invitation_id
        where ji.contractor_id = ct.id and m.sender = 'contractor'
          and m.moderation = 'rejected' and m.moderated_at > p_on - v_clean_days) as rejected,
      -- A moderation that ends inside the window was in force inside it.
      (ct.messages_moderated_until > p_on - v_clean_days) as moderated
    from contractors ct
    where ct.status = 'approved' and ct.vetted_at is not null
  loop
    v_clean := r.flags = 0 and r.rejected = 0 and not coalesce(r.moderated, false);
    v_reasons := '{}';
    if r.flags > 0 then v_reasons := v_reasons || format('%s refused message(s) or note(s) in %s days', r.flags, v_clean_days); end if;
    if r.rejected > 0 then v_reasons := v_reasons || format('%s message(s) removed by a moderator', r.rejected); end if;
    if coalesce(r.moderated, false) then v_reasons := v_reasons || 'messages under moderation'::text; end if;

    if v_clean and r.won >= 1 then
      v_tier := 'priority';
      v_reasons := v_reasons || format('booked %s job(s) through the platform in %s days', r.won, v_won_days);
    elsif v_clean and r.priced >= v_pr_min and r.median_hours is not null and r.median_hours <= v_resp_h then
      v_tier := 'responsive';
      v_reasons := v_reasons || format('priced %s jobs in %s days, median %sh to price', r.priced, v_pr_days, round(r.median_hours, 1));
    else
      v_tier := 'standard';
      if v_clean then
        if r.won = 0 and r.priced < v_pr_min then
          v_reasons := v_reasons || format('priced %s of the %s needed in %s days', r.priced, v_pr_min, v_pr_days);
        elsif r.won = 0 then
          v_reasons := v_reasons || format('median %sh to price, over the %sh needed', round(coalesce(r.median_hours, 0), 1), v_resp_h);
        end if;
      else
        v_reasons := v_reasons || 'standing lost until the record is clean'::text;
      end if;
    end if;

    insert into contractor_standing
      (contractor_id, computed_on, tier, won, priced, median_hours, flags, rejected_msgs, moderated, clean, reasons)
    values
      (r.id, p_on, v_tier, r.won, r.priced, round(r.median_hours, 1), r.flags, r.rejected, coalesce(r.moderated, false), v_clean, v_reasons)
    on conflict (contractor_id, computed_on) do update
      set tier = excluded.tier, won = excluded.won, priced = excluded.priced,
          median_hours = excluded.median_hours, flags = excluded.flags,
          rejected_msgs = excluded.rejected_msgs, moderated = excluded.moderated,
          clean = excluded.clean, reasons = excluded.reasons, computed_at = now();
    v_counts := jsonb_set(v_counts, array[v_tier], to_jsonb((v_counts->>v_tier)::int + 1));
  end loop;
  return v_counts;
end;
$$;

-- ── The shadow window on each job ───────────────────────────────────────
create table if not exists priority_shadow (
  submission_id       uuid primary key references job_submissions(id) on delete cascade,
  county_id           int,
  distributed_at      timestamptz not null,
  -- Offered to one contractor first (a repeat, or HPM's first refusal): the
  -- shadow window would start when the market actually opened.
  direct              boolean not null,
  -- The standing used was computed after the fact, not on the day.
  backfilled          boolean not null default false,
  invited             int not null,
  priority_ids        uuid[] not null,
  responsive_ids      uuid[] not null,
  window_opens_at     timestamptz not null,   -- Responsive would see it
  market_opens_at     timestamptz not null,   -- everyone would
  -- Filled in by the tick as the job goes on.
  first_price_at      timestamptz,
  first_price_by      uuid,
  first_price_tier    text,
  first_price_hours   numeric,
  -- Under the scheme the first price could not have come before its
  -- sender's window; this is how much later it would have been.
  first_price_delay_h numeric,
  prices_priority     int not null default 0,
  prices_responsive   int not null default 0,
  prices_standard     int not null default 0,
  booked_at           timestamptz,
  booked_by           uuid,
  booked_tier         text,
  outcome             text,   -- the job's status when last looked at
  updated_at          timestamptz not null default now()
);
create index if not exists priority_shadow_distributed_idx on priority_shadow (distributed_at desc);
alter table priority_shadow enable row level security;
revoke all on priority_shadow from public, anon, authenticated;
grant all on priority_shadow to service_role;

-- Writes the row for one job: who, by today's standing (or the standing on
-- the day, when it exists), would have been in each window.
create or replace function sq_priority_shadow_open(p_submission_id uuid, p_backfill boolean default false)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js     job_submissions%rowtype;
  v_day    date;
  v_start  timestamptz;
  v_pri    uuid[];
  v_resp   uuid[];
  v_n      int;
  v_direct boolean;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  if not found or v_js.distributed_at is null then return; end if;
  v_direct := v_js.market_opens_at is not null or v_js.preferred_contractor_id is not null;
  -- A direct offer that opened to the market started its window then.
  v_start := coalesce(
    (select created_at from job_events where job_id = v_js.id and event_type = 'market_opened'
      order by created_at limit 1),
    case when v_js.market_opens_at is not null and v_js.market_opens_at <= now() then v_js.market_opens_at end,
    v_js.distributed_at);
  v_day := (v_start at time zone 'Europe/London')::date;

  select count(*),
         coalesce(array_agg(ji.contractor_id) filter (where t = 'priority'), '{}'),
         coalesce(array_agg(ji.contractor_id) filter (where t = 'responsive'), '{}')
    into v_n, v_pri, v_resp
    from job_invitations ji
    cross join lateral (select case when p_backfill
                                    then (select tier from contractor_standing_latest where contractor_id = ji.contractor_id)
                                    else sq_tier_on(ji.contractor_id, v_day) end) x(t)
   where ji.submission_id = v_js.id;

  insert into priority_shadow
    (submission_id, county_id, distributed_at, direct, backfilled, invited, priority_ids, responsive_ids,
     window_opens_at, market_opens_at)
  values
    (v_js.id, v_js.county_id, v_start, v_direct, p_backfill, v_n, v_pri, v_resp,
     v_start + make_interval(hours => app_config_num('sq_priority_window_hours', 24)::int),
     v_start + make_interval(hours => app_config_num('sq_responsive_window_hours', 48)::int))
  on conflict (submission_id) do nothing;
end;
$$;

-- A new job: the moment it is distributed. Direct offers are re-opened by
-- the sweep below once the market actually sees them, so their window
-- starts then rather than at the offer.
create or replace function sq_priority_shadow_on_distribute() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'distributed' and old.status is distinct from 'distributed' then
    perform sq_priority_shadow_open(new.id, false);
  end if;
  return null;
end;
$$;
drop trigger if exists job_submissions_priority_shadow on job_submissions;
create trigger job_submissions_priority_shadow
  after update of status on job_submissions
  for each row execute function sq_priority_shadow_on_distribute();

-- What happened, for every job in the last 90 days.
create or replace function sq_priority_shadow_tick() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r      record;
  v_n    int := 0;
  v_tier text;
begin
  -- Jobs distributed without the trigger (before this existed, or by the
  -- 5-minute backstop re-running distribute on the same status): added now.
  for r in
    select js.id from job_submissions js
     where js.distributed_at > now() - interval '90 days'
       and not exists (select 1 from priority_shadow p where p.submission_id = js.id)
  loop
    perform sq_priority_shadow_open(r.id, true);
  end loop;

  for r in
    select p.*, js.status, js.awarded_contractor_id, js.awarded_at
      from priority_shadow p join job_submissions js on js.id = p.submission_id
     where p.distributed_at > now() - interval '90 days'
  loop
    update priority_shadow p set
      first_price_at = fp.at,
      first_price_by = fp.by,
      first_price_tier = fp.tier,
      first_price_hours = round(extract(epoch from fp.at - p.distributed_at) / 3600, 1),
      first_price_delay_h = case fp.tier
        when 'priority' then 0
        when 'responsive' then round(greatest(0, extract(epoch from p.window_opens_at - fp.at) / 3600), 1)
        else round(greatest(0, extract(epoch from p.market_opens_at - fp.at) / 3600), 1) end,
      prices_priority   = (select count(distinct cq.contractor_id) from client_quotes cq where cq.submission_id = p.submission_id and cq.contractor_id = any (p.priority_ids)),
      prices_responsive = (select count(distinct cq.contractor_id) from client_quotes cq where cq.submission_id = p.submission_id and cq.contractor_id = any (p.responsive_ids)),
      prices_standard   = (select count(distinct cq.contractor_id) from client_quotes cq where cq.submission_id = p.submission_id
                            and not (cq.contractor_id = any (p.priority_ids)) and not (cq.contractor_id = any (p.responsive_ids))),
      booked_at = r.awarded_at,
      booked_by = r.awarded_contractor_id,
      booked_tier = case when r.awarded_contractor_id is null then null
                         when r.awarded_contractor_id = any (p.priority_ids) then 'priority'
                         when r.awarded_contractor_id = any (p.responsive_ids) then 'responsive'
                         else 'standard' end,
      outcome = r.status,
      updated_at = now()
    from (
      select cq.created_at as at, cq.contractor_id as by,
             case when cq.contractor_id = any (r.priority_ids) then 'priority'
                  when cq.contractor_id = any (r.responsive_ids) then 'responsive'
                  else 'standard' end as tier
        from client_quotes cq
       where cq.submission_id = r.submission_id and cq.created_at >= r.distributed_at
       order by cq.created_at limit 1
    ) fp
    where p.submission_id = r.submission_id;
    -- A job with no price yet still gets its outcome stamped.
    if not found then
      update priority_shadow set outcome = r.status, updated_at = now() where submission_id = r.submission_id;
    end if;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('updated', v_n);
end;
$$;

-- Nightly: standing first, then the shadow outcomes against it.
create or replace function sq_priority_nightly() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  return jsonb_build_object('standing', sq_standing_compute(), 'shadow', sq_priority_shadow_tick());
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'priority-standing') then
    perform cron.unschedule('priority-standing');
  end if;
  perform cron.schedule('priority-standing', '15 2 * * *', $c$select sq_priority_nightly();$c$);
end $$;

-- `revoke … from public` alone is a no-op here: default privileges grant
-- anon and authenticated directly, so they are named.
revoke execute on function sq_tier_on(uuid, date)                   from public, anon, authenticated;
revoke execute on function sq_standing_compute(date)                from public, anon, authenticated;
revoke execute on function sq_priority_shadow_open(uuid, boolean)   from public, anon, authenticated;
revoke execute on function sq_priority_shadow_on_distribute()       from public, anon, authenticated;
revoke execute on function sq_priority_shadow_tick()                from public, anon, authenticated;
revoke execute on function sq_priority_nightly()                    from public, anon, authenticated;
grant  execute on function sq_standing_compute(date)                to service_role;
grant  execute on function sq_priority_shadow_tick()                to service_role;
grant  execute on function sq_priority_nightly()                    to service_role;

-- Day one: score everyone now and run the last 90 days through it, so the
-- page has history rather than an empty table until tomorrow night.
select sq_priority_nightly();
