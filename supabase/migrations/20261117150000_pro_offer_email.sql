-- A standalone Pro offer email (sq_pro_offer).
--
-- Until now Pro was pitched only as a closing line on emails sent for other
-- reasons: the market-open invitation, the members-first notice and the
-- weekly digest. From 24 Oct to 17 Nov 2026 that was 1,418 emails to 265 free
-- contractors and no sales. This email is about one thing: the jobs this
-- contractor was invited to price after Pro members already had them, and
-- how many hours behind they were. It's measured on its own:
-- contractor_pro_offers records each send, clicks on its link (/go/pro/<id>)
-- and, through sq_pro_offer_stats(), whether a subscription followed.
--
-- Claims are kept to what the data shows. Members held these jobs for a
-- median of about 6 hours and rarely priced them, so the email gives the
-- head start in hours and doesn't say members "took" the work.
--
-- Off until switched on: sq_pro_offer_enabled = 1. At most one per
-- contractor every sq_pro_offer_cooldown_days, and only when at least
-- sq_pro_offer_min_jobs such jobs fall in the last 30 days. Honours
-- notify_new_jobs and the test allowlist like the digest.

insert into app_config (key, value) values
  ('sq_pro_offer_enabled', '0'),
  ('sq_pro_offer_min_jobs', '2'),
  ('sq_pro_offer_cooldown_days', '60')
on conflict (key) do nothing;

create table if not exists public.contractor_pro_offers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  sent_at timestamptz not null default now(),
  -- What the email said, so a later reading can compare like with like.
  jobs int not null,
  median_hours numeric,
  email_id uuid references public.pending_emails(id) on delete set null,
  -- First human-looking tap on the email's link, and how many there were.
  clicked_at timestamptz,
  clicks int not null default 0
);
create index if not exists contractor_pro_offers_contractor_idx
  on public.contractor_pro_offers (contractor_id, sent_at desc);

alter table public.contractor_pro_offers enable row level security;
revoke all on public.contractor_pro_offers from public, anon, authenticated;

-- ── Payload: the jobs that reached Pro members first ──────────────────────
create or replace function public.sq_pro_offer_payload(p_contractor_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_ct      contractors%rowtype;
  v_n       int;
  v_median  numeric;
  v_jobs    jsonb;
begin
  select * into v_ct from contractors where id = p_contractor_id;
  if not found or contractor_is_premium(p_contractor_id) then return null; end if;

  -- Invitations this contractor got as an ordinary (non-member) invitee
  -- to a job that had a members' window, sent at least 30 minutes after the
  -- window started. A shorter gap is distribution noise, not a head start.
  with j as (
    select js.id, js.service_id, js.service_verbatim, js.postcode, c.name as county,
           ji.sent_at,
           extract(epoch from ji.sent_at - js.premium_started_at) / 3600.0 as hours_behind
      from job_invitations ji
      join job_submissions js on js.id = ji.submission_id
      left join counties c on c.id = js.county_id
     where ji.contractor_id = p_contractor_id
       and not ji.premium_offer
       and js.premium_window
       and js.premium_started_at > now() - interval '30 days'
       and ji.sent_at > js.premium_started_at + interval '30 minutes'
       and js.hidden_at is null
  )
  select count(*),
         percentile_cont(0.5) within group (order by hours_behind),
         (select coalesce(jsonb_agg(x order by x->>'sent_at' desc), '[]'::jsonb)
            from (select jsonb_build_object(
                           'service', sq_service_label(j2.service_id, j2.service_verbatim),
                           'postcode_district', split_part(j2.postcode, ' ', 1),
                           'county', j2.county,
                           'sent_at', j2.sent_at,
                           'hours_behind', round(j2.hours_behind::numeric, 1)) as x
                    from j j2 order by j2.sent_at desc limit 5) t)
    into v_n, v_median, v_jobs
    from j;

  if v_n < app_config_num('sq_pro_offer_min_jobs', 2) then return null; end if;

  return jsonb_build_object(
    'business_name', v_ct.business_name,
    'contact_name', v_ct.contact_name,
    'job_count', v_n,
    'median_hours', round(v_median, 1),
    'jobs', v_jobs);
end;
$$;

-- ── Weekly tick ───────────────────────────────────────────────────────────
create or replace function public.sq_pro_offer_tick()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r           record;
  v_payload   jsonb;
  v_offer     uuid;
  v_email     uuid;
  v_allowlist jsonb;
  v_sent      int := 0;
  v_skipped   int := 0;
begin
  if app_config_num('sq_pro_offer_enabled', 0) <> 1 then
    return jsonb_build_object('enabled', false);
  end if;
  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  for r in
    select ct.id, ct.email from contractors ct
     where ct.status = 'approved' and ct.vetted_at is not null and ct.notify_new_jobs
       and ct.email is not null
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
       and not exists (
         select 1 from contractor_pro_offers o
          where o.contractor_id = ct.id
            and o.sent_at > now() - make_interval(days => app_config_num('sq_pro_offer_cooldown_days', 60)::int))
  loop
    v_payload := sq_pro_offer_payload(r.id);
    if v_payload is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into contractor_pro_offers (contractor_id, jobs, median_hours)
    values (r.id, (v_payload->>'job_count')::int, (v_payload->>'median_hours')::numeric)
    returning id into v_offer;
    insert into pending_emails (kind, to_email, payload)
    values ('sq_pro_offer', r.email, v_payload || jsonb_build_object('offer_id', v_offer))
    returning id into v_email;
    update contractor_pro_offers set email_id = v_email where id = v_offer;
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('sent', v_sent, 'not_eligible', v_skipped);
end;
$$;

-- Sends one contractor's email to the admin only. Records nothing, and the
-- link is a plain membership link because there's no offer row to count against.
create or replace function public.sq_pro_offer_preview(p_contractor_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_payload jsonb := sq_pro_offer_payload(p_contractor_id);
begin
  if v_payload is null then return jsonb_build_object('ok', false, 'reason', 'not_eligible'); end if;
  insert into pending_emails (kind, to_email, payload)
  values ('sq_pro_offer', '__admin__', v_payload || jsonb_build_object('preview', true));
  return jsonb_build_object('ok', true, 'jobs', v_payload->'job_count', 'median_hours', v_payload->'median_hours');
end;
$$;

-- The /go/pro/<id> route calls this on every GET; p_count is false for
-- link-preview fetchers so they don't look like taps.
create or replace function public.pro_offer_link_hit(p_id uuid, p_count boolean)
returns void
language sql security definer
set search_path = public
as $$
  update contractor_pro_offers
     set clicks = clicks + 1,
         clicked_at = coalesce(clicked_at, now())
   where id = p_id and p_count;
$$;

-- Each send, whether it was tapped, and whether a paid membership started
-- within 14 days of it (comps aren't sales, so they don't count).
create or replace function public.sq_pro_offer_stats()
returns table (week date, sent bigint, clicked bigint, subscribed_14d bigint, subscribed_after_click bigint)
language sql stable security definer
set search_path = public
as $$
  select date_trunc('week', o.sent_at at time zone 'Europe/London')::date,
         count(*),
         count(*) filter (where o.clicked_at is not null),
         count(*) filter (where s.started_at is not null),
         count(*) filter (where s.started_at is not null and o.clicked_at is not null)
    from contractor_pro_offers o
    left join subscriptions s
      on s.contractor_id = o.contractor_id
     and s.stripe_subscription_id is not null
     and s.started_at between o.sent_at and o.sent_at + interval '14 days'
   group by 1
   order by 1;
$$;

revoke execute on function public.sq_pro_offer_payload(uuid) from public, anon, authenticated;
revoke execute on function public.sq_pro_offer_tick() from public, anon, authenticated;
revoke execute on function public.sq_pro_offer_preview(uuid) from public, anon, authenticated;
revoke execute on function public.pro_offer_link_hit(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.sq_pro_offer_stats() from public, anon, authenticated;
grant execute on function public.pro_offer_link_hit(uuid, boolean) to service_role;
grant execute on function public.sq_pro_offer_stats() to service_role;

-- Wednesdays 09:00 UTC (09:00 GMT, 10:00 BST), away from Monday's digest.
-- Does nothing while sq_pro_offer_enabled is 0.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'pro-offer') then
    perform cron.unschedule('pro-offer');
  end if;
  perform cron.schedule('pro-offer', '0 9 * * 3', $c$select sq_pro_offer_tick();$c$);
end $$;
