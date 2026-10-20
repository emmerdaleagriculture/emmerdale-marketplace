-- ============================================================================
-- Market data for Open members: sq_market_data(contractor).
--
-- What the dashboard's Market data page shows an Open member about their
-- own patch — the counties they cover, within reach of their base, over
-- the last twelve months:
--
--   months    jobs distributed each month, and how many of them reached
--             them (an invitation);
--   services  per service: jobs, how many prices went in, from how many
--             contractors, and the typical price — the median, to the
--             nearest £10, given only once at least
--             sq_price_position_min_others OTHER contractors have priced
--             the service (the floor sq_quote_position uses). One coarse
--             figure, not quartiles: three quantiles of four prices would
--             let a member solve for the other three;
--   mine      the invitations sent to them in the period, how many of
--             those jobs they priced and how many they won — one cut, so
--             won can never exceed priced;
--   field     prices sent and jobs won across every contractor on those
--             jobs, so their rate has something to stand against.
--
-- Prices are what contractors charged (contractor_quotes, confirmed,
-- current, total quotes only — a per-acre rate is not a job price), never
-- what the customer saw. Service role only; the page confirms the tier
-- first (membershipOf), as the dashboard does for everything Open.
-- ============================================================================

-- The jobs in a contractor's area since a date: distributed, not hidden, in
-- a county they cover, within reach of their base and work they take
-- (sq_contractor_wants_job, as every invitation path) — a hay merchant's
-- patch is hay, not every job in the county.
create or replace function public.sq_area_jobs(p_contractor_id uuid, p_since timestamptz)
 returns table (id uuid, distributed_at timestamptz, service_id int,
                awarded_contractor_id uuid, awarded_at timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select js.id, js.distributed_at, js.service_id, js.awarded_contractor_id, js.awarded_at
    from contractors ct
    join contractor_counties cc on cc.contractor_id = ct.id
    join job_submissions js on js.county_id = cc.county_id
   where ct.id = p_contractor_id
     and js.distributed_at >= p_since
     and js.hidden_at is null
     and sq_contractor_wants_job(ct, js)
     and sq_in_invite_range(js.lat, js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles)
$function$;
revoke execute on function public.sq_area_jobs(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.sq_area_jobs(uuid, timestamptz) to service_role;

create or replace function public.sq_market_data(p_contractor_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_ct       contractors%rowtype;
  v_since    timestamptz := date_trunc('month', now()) - interval '11 months';
  v_min      int := app_config_num('sq_price_position_min_others', 3)::int;
  v_months   jsonb;
  v_services jsonb;
  v_mine     jsonb;
  v_field    jsonb;
begin
  select * into v_ct from contractors where id = p_contractor_id;
  if not found then return null; end if;

  -- Twelve buckets from one pass over the area.
  with area as (select * from sq_area_jobs(v_ct.id, v_since)),
       by_month as (
         select date_trunc('month', a.distributed_at) as m,
                count(*) as jobs,
                count(ji.id) as invited
           from area a
           left join job_invitations ji on ji.submission_id = a.id and ji.contractor_id = v_ct.id
          group by 1)
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(g.m, 'YYYY-MM'),
           'jobs', coalesce(b.jobs, 0),
           'invited', coalesce(b.invited, 0)) order by g.m), '[]'::jsonb)
    into v_months
    from generate_series(v_since, date_trunc('month', now()), interval '1 month') g(m)
    left join by_month b on b.m = g.m;

  select coalesce(jsonb_agg(row_to_json(t) order by t.jobs desc, t.service), '[]'::jsonb)
    into v_services
    from (
      select coalesce(s.name, 'Other work') as service,
             count(distinct a.id) as jobs,
             count(q.id) as prices,
             count(distinct q.contractor_id) as contractors,
             case when count(distinct q.contractor_id) filter (where q.contractor_id <> v_ct.id) >= v_min
                  then (round(percentile_cont(0.5) within group (order by q.contractor_price_pence)::numeric / 1000) * 1000)::bigint end as median,
             count(distinct a.id) filter (where a.awarded_at is not null) as won
        from sq_area_jobs(v_ct.id, v_since) a
        left join services s on s.id = a.service_id
        left join contractor_quotes q
          on q.submission_id = a.id
         and q.confirmed_by_contractor
         and q.superseded_by is null
         and q.quote_type = 'total'
       group by coalesce(s.name, 'Other work')
    ) t;

  -- Their own figures, all cut on the invitations sent to them in the
  -- period: of those jobs, the ones they priced and the ones they won.
  with mine as (
    select ji.submission_id,
           exists (select 1 from contractor_quotes q
                    where q.submission_id = ji.submission_id and q.contractor_id = v_ct.id
                      and q.confirmed_by_contractor) as priced,
           exists (select 1 from job_submissions js
                    where js.id = ji.submission_id and js.awarded_contractor_id = v_ct.id) as won
      from job_invitations ji
     where ji.contractor_id = v_ct.id and ji.sent_at >= v_since)
  select jsonb_build_object(
           'invited', count(*),
           'priced', count(*) filter (where priced),
           'won', count(*) filter (where priced and won))
    into v_mine
    from mine;

  with area as (select * from sq_area_jobs(v_ct.id, v_since))
  select jsonb_build_object(
           'priced', (select count(distinct (q.submission_id, q.contractor_id))
                        from contractor_quotes q join area a on a.id = q.submission_id
                       where q.confirmed_by_contractor),
           'won', (select count(*) from area a where a.awarded_at is not null))
    into v_field;

  return jsonb_build_object(
    'since', v_since, 'min_others', v_min,
    'months', v_months, 'services', v_services, 'mine', v_mine, 'field', v_field);
end;
$function$;
revoke execute on function public.sq_market_data(uuid) from public, anon, authenticated;
grant execute on function public.sq_market_data(uuid) to service_role;
