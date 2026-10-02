-- ============================================================================
-- One read for the dashboard's "Passed prices" section (20261002170000):
-- how often prices are passed on and why, what happens next (a revised
-- price, an undo, a booking), jobs where everything was passed, and the
-- contractors passed on most. Last 30 days unless said otherwise.
-- ============================================================================
create or replace function admin_pass_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select cp.*, q.client_price_pence, q.contractor_display_label
      from client_quote_passes cp join client_quotes q on q.id = cp.client_quote_id
     where cp.created_at > now() - interval '30 days'
  ),
  live as (select * from p where undone_at is null),
  -- A revised price: a later client_quotes row by the same contractor on the same job.
  revised as (
    select l.client_quote_id, l.submission_id, l.contractor_id,
           (select min(q2.created_at) from client_quotes q2
             where q2.submission_id = l.submission_id and q2.contractor_id = l.contractor_id
               and q2.created_at > l.created_at) as revised_at
      from live l
  ),
  prices_30d as (
    select count(*) as n from client_quotes
     where created_at > now() - interval '30 days' and status in ('active', 'accepted', 'superseded', 'closed')
  )
  select jsonb_build_object(
    'passes',        (select count(*) from live),
    'undone',        (select count(*) from p where undone_at is not null),
    'prices',        (select n from prices_30d),
    'jobs_with_pass',(select count(distinct submission_id) from live),
    'reasons',       coalesce((select jsonb_object_agg(reason, n) from (select reason, count(*) n from live group by reason) r), '{}'::jsonb),
    'revised',       (select count(*) from revised where revised_at is not null),
    'revised_booked',(select count(*) from revised r join job_submissions js on js.id = r.submission_id
                       where r.revised_at is not null and js.awarded_contractor_id = r.contractor_id),
    'passed_then_booked_other', (select count(distinct l.submission_id) from live l join job_submissions js on js.id = l.submission_id
                                  where js.awarded_contractor_id is not null and js.awarded_contractor_id <> l.contractor_id),
    'median_hours_to_pass', (select round((percentile_cont(0.5) within group (order by extract(epoch from l.created_at - q.created_at) / 3600))::numeric, 1)
                               from live l join client_quotes q on q.id = l.client_quote_id),
    'avg_passed_pence', (select round(avg(client_price_pence)) from live),
    'avg_price_pence',  (select round(avg(client_price_pence)) from client_quotes where created_at > now() - interval '30 days'),
    -- Open jobs where the customer has passed on every live price: waiting, or about to withdraw.
    'all_passed_open', (select count(*) from job_submissions js
                         where js.status = 'quotes_receiving'
                           and exists (select 1 from client_quotes q where q.submission_id = js.id and q.status = 'active')
                           and not exists (select 1 from client_quotes q where q.submission_id = js.id and q.status = 'active'
                                             and not exists (select 1 from client_quote_passes cp where cp.client_quote_id = q.id and cp.undone_at is null))),
    'contractors', coalesce((select jsonb_agg(row_to_json(t)) from (
        select ct.id, ct.business_name,
               count(*) as passes,
               count(*) filter (where l.reason = 'too_expensive') as too_expensive,
               (select count(*) from client_quotes q where q.contractor_id = ct.id and q.created_at > now() - interval '30 days') as prices
          from live l join contractors ct on ct.id = l.contractor_id
         group by ct.id, ct.business_name
        having count(*) >= 2
         order by count(*) desc, ct.business_name
         limit 8) t), '[]'::jsonb),
    'generated_at', now())
$$;
revoke execute on function admin_pass_summary() from public, anon, authenticated;
grant  execute on function admin_pass_summary() to service_role;
