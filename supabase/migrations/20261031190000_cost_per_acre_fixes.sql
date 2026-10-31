-- ============================================================================
-- Cost per acre, second pass (review of PR #292).
--
-- 1. A per-acre RATE quote is turned into a job total by
--    submit_contractor_quote using the measured acreage first
--    (coalesce(area_mapped_value, stated acres)), while the snapshot divided
--    every total by the jobAcres() rule (the customer's own figure when they
--    kept it). On a job where the two differ, a rate quote's per-acre figure
--    was not the rate the contractor gave. Rate quotes are now divided by
--    the acreage their total was built on; total quotes by jobAcres().
-- 2. The addresses that are us, not customers, were a literal list inside
--    the function. They are now app_config.sq_internal_email_domains, so a
--    new test identity is a config edit, not a migration.
-- 3. The refresh dropped its temp table only on commit, so a second call in
--    the same transaction failed. It now drops any leftover first.
-- ============================================================================

insert into app_config (key, value)
values ('sq_internal_email_domains',
        '["example.com", "emmerdaleagriculture.com", "lumenira.com", "hampshirepaddockmanagement.com"]'::jsonb)
on conflict (key) do nothing;

-- Addresses that are us, not customers: the jobs we raised to test the flow.
-- Domains from app_config (lower-cased on both sides); .invalid and .test
-- addresses always.
create or replace function public.sq_is_internal_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_email is not null and (
    lower(split_part(p_email, '@', 2)) in (
      select lower(d)
        from jsonb_array_elements_text(
               coalesce((select value from app_config where key = 'sq_internal_email_domains'), '[]'::jsonb)) d)
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
  drop table if exists cpa_jobs;

  -- One row per job that qualifies, with its per-acre figure: the mean over
  -- its current prices of each price per acre.
  create temp table cpa_jobs on commit drop as
  with acreage as (
    select js.id, js.county_id, js.service_id, js.created_at, js.customer_id, js.contact_email, js.hidden_at,
           -- jobAcres(): the measured figure unless the customer kept their own.
           case when js.area_source = 'stated' then coalesce(u.stated, u.mapped)
                else coalesce(u.mapped, u.stated) end as acres,
           -- What submit_contractor_quote multiplies a rate by.
           coalesce(u.mapped, u.stated) as rate_acres
      from job_submissions js
      cross join lateral (
        select js.area_mapped_value as mapped,
               case when js.area_unit = 'acres' then js.area_value end as stated) u
     where js.area_unit is distinct from 'linear_m'),
  priced as (
    select cl.submission_id,
           avg(case when cq.quote_type = 'rate' then cl.client_price_pence / a.rate_acres
                    else cl.client_price_pence / a.acres end)::numeric as per_acre_pence,
           count(*)::int as quotes
      from client_quotes cl
      join contractor_quotes cq on cq.id = cl.contractor_quote_id
      join acreage a on a.id = cl.submission_id
     where cl.status <> 'superseded'
       and cl.withdrawn_at is null
       and cl.client_price_pence > 0
       and cq.quote_type in ('total', 'rate')
       and a.acres > 0
       and (cq.quote_type <> 'rate' or a.rate_acres > 0)
     group by cl.submission_id)
  select a.id,
         a.county_id, c.name as county, c.region,
         a.service_id, s.name as service,
         a.created_at,
         p.quotes,
         a.acres,
         p.per_acre_pence
    from priced p
    join acreage a on a.id = p.submission_id
    join services s on s.id = a.service_id and s.area_priced
    join counties c on c.id = a.county_id
    left join customers cu on cu.id = a.customer_id
   where a.hidden_at is null
     and not sq_is_internal_email(coalesce(a.contact_email, cu.email));

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

-- Retake the snapshot under the corrected rules.
select public.sq_cost_per_acre_refresh();
