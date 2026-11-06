-- ============================================================================
-- Cost per acre by county: the data behind the public /cost-per-acre page.
--
-- What a customer was quoted for a job, divided by the job's acreage, averaged
-- across the jobs in a county, a region and the whole UK, per service. One
-- snapshot table, rebuilt on the first of every month by pg_cron; the page
-- reads the snapshot and says when it was taken, so a figure never changes
-- under a reader between refreshes.
--
-- The rules, in one place:
--
--   a job's price     the mean of the prices the customer saw for it
--                     (client_quotes, including our margin: this is what the
--                     job would have cost them). Every current price counts
--                     whether or not the customer accepted it; a price the
--                     contractor replaced (superseded) or withdrew does not.
--                     Per-unit prices (so many bales, so many hours) are not
--                     a price for the area and are left out; a per-acre rate
--                     is stored as the job total and counts;
--   a job's acreage   jobAcres() in src/lib/jobParse/geometry.ts, in SQL:
--                     the measured figure unless the customer kept their own,
--                     nothing for a job measured in metres;
--   which jobs        area-priced services only (a per-acre figure for hedge
--                     cutting or fencing is nonsense), not hidden, not ours
--                     (the test addresses), with an acreage above zero;
--   the average       the mean of the jobs' per-acre figures, with the low,
--                     high and median beside it so a one-job county reads as
--                     one job.
-- ============================================================================

create table if not exists public.cost_per_acre (
  id bigint generated always as identity primary key,
  -- 'uk' (region and county null), 'region' (county null) or 'county'.
  scope text not null check (scope in ('uk', 'region', 'county')),
  region text,
  county_id int references public.counties (id),
  county text,
  service_id int not null references public.services (id),
  service text not null,
  jobs int not null,
  quotes int not null,
  acres numeric not null,
  avg_per_acre_pence int not null,
  median_per_acre_pence int not null,
  low_per_acre_pence int not null,
  high_per_acre_pence int not null,
  -- Oldest job in the snapshot, so the page can say what period it covers.
  since timestamptz not null,
  computed_at timestamptz not null
);

comment on table public.cost_per_acre is
  'Monthly snapshot: mean customer price per acre by service, for the UK, each region and each county. Rebuilt by sq_cost_per_acre_refresh() (pg_cron cost-per-acre-refresh).';

create index if not exists cost_per_acre_scope_idx on public.cost_per_acre (scope, service_id);

-- Read server-side with the service role; the figures are public, but a
-- browser never queries this table directly.
alter table public.cost_per_acre enable row level security;
revoke all on public.cost_per_acre from public, anon, authenticated;
grant select on public.cost_per_acre to service_role;

-- Addresses that are us, not customers: the jobs we raised to test the flow.
create or replace function public.sq_is_internal_email(p_email text)
returns boolean
language sql
immutable
as $$
  select p_email is not null and (
    lower(split_part(p_email, '@', 2)) in ('example.com', 'emmerdaleagriculture.com', 'lumenira.com')
    or lower(p_email) like '%.invalid'
    or lower(p_email) like '%.test'
  )
$$;

create or replace function public.sq_cost_per_acre_refresh()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now  timestamptz := now();
  v_jobs int;
  v_rows int;
begin
  -- One row per job that qualifies, with its per-acre figure.
  create temp table cpa_jobs on commit drop as
  with priced as (
    select cl.submission_id,
           avg(cl.client_price_pence)::numeric as price_pence,
           count(*)::int as quotes
      from client_quotes cl
      join contractor_quotes cq on cq.id = cl.contractor_quote_id
     where cl.status <> 'superseded'
       and cl.withdrawn_at is null
       and cl.client_price_pence > 0
       and cq.quote_type in ('total', 'rate')
     group by cl.submission_id)
  select js.id,
         js.county_id, c.name as county, c.region,
         js.service_id, s.name as service,
         js.created_at,
         p.price_pence, p.quotes,
         a.acres,
         p.price_pence / a.acres as per_acre_pence
    from priced p
    join job_submissions js on js.id = p.submission_id
    join services s on s.id = js.service_id and s.area_priced
    join counties c on c.id = js.county_id
    left join customers cu on cu.id = js.customer_id
    cross join lateral (
      select case
               when js.area_unit = 'linear_m' then null
               when js.area_source = 'stated'
                 then coalesce(case when js.area_unit = 'acres' then js.area_value end, js.area_mapped_value)
               else coalesce(js.area_mapped_value, case when js.area_unit = 'acres' then js.area_value end)
             end as acres) a
   where js.hidden_at is null
     and a.acres > 0
     and not sq_is_internal_email(coalesce(js.contact_email, cu.email));

  select count(*) into v_jobs from cpa_jobs;

  delete from cost_per_acre;

  insert into cost_per_acre
    (scope, region, county_id, county, service_id, service, jobs, quotes, acres,
     avg_per_acre_pence, median_per_acre_pence, low_per_acre_pence, high_per_acre_pence,
     since, computed_at)
  select g.scope, g.region, g.county_id, g.county, g.service_id, g.service,
         count(*)::int, sum(g.quotes)::int, round(sum(g.acres), 2),
         round(avg(g.per_acre_pence))::int,
         round(percentile_cont(0.5) within group (order by g.per_acre_pence))::int,
         round(min(g.per_acre_pence))::int,
         round(max(g.per_acre_pence))::int,
         min(g.created_at), v_now
    from (
      select 'uk' as scope, null::text as region, null::int as county_id, null::text as county,
             service_id, service, quotes, acres, per_acre_pence, created_at from cpa_jobs
      union all
      select 'region', region, null, null, service_id, service, quotes, acres, per_acre_pence, created_at from cpa_jobs
      union all
      select 'county', region, county_id, county, service_id, service, quotes, acres, per_acre_pence, created_at from cpa_jobs
    ) g
   group by g.scope, g.region, g.county_id, g.county, g.service_id, g.service;

  get diagnostics v_rows = row_count;
  return jsonb_build_object('jobs', v_jobs, 'rows', v_rows, 'computed_at', v_now);
end;
$function$;

comment on function public.sq_cost_per_acre_refresh() is
  'Rebuilds cost_per_acre from every current customer price. Monthly by pg_cron; safe to run by hand.';

revoke execute on function public.sq_cost_per_acre_refresh() from public, anon, authenticated;
grant execute on function public.sq_cost_per_acre_refresh() to service_role;
revoke execute on function public.sq_is_internal_email(text) from public, anon, authenticated;
grant execute on function public.sq_is_internal_email(text) to service_role;

-- First of the month, 03:35 UTC: after the nightly jobs, before anyone reads.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cost-per-acre-refresh') then
    perform cron.unschedule('cost-per-acre-refresh');
  end if;
  perform cron.schedule('cost-per-acre-refresh', '35 3 1 * *', $c$select public.sq_cost_per_acre_refresh();$c$);
end $$;

-- The first snapshot, so the page has something to show from the first deploy.
select public.sq_cost_per_acre_refresh();
