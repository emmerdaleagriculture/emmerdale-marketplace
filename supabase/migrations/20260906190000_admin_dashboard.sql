-- ============================================================================
-- The dashboard for the model the site actually runs now.
--
-- /admin/metrics reported the old board: jobs posted, jobs open, contact
-- opens. None of that is how work moves any more. Work is a submission that
-- goes out to contractors, comes back priced, is accepted, paid, done and
-- confirmed — and the questions an operator has are about that funnel, the
-- money in it, the people on both sides of it, and where in the country it
-- is happening.
--
-- One function, one round trip, one JSON document. Every number is a plain
-- count or sum over tables that are small today; when they are not, the
-- indexes added this morning are the ones these queries lean on.
-- ============================================================================

create or replace function admin_dashboard() returns jsonb
language sql stable security definer set search_path = public as $$
with
  since30 as (select now() - interval '30 days' as t),
  since7  as (select now() - interval '7 days'  as t),
  -- A "job" here is a submission the customer actually confirmed. Drafts and
  -- abandoned parses are funnel leakage, counted separately.
  js as (select * from job_submissions where status not in ('draft','abandoned')),
  money as (
    select p.submission_id, p.amount_pence, p.status, p.paid_at, p.refunded_pence,
           cq.client_price_pence, ctq.contractor_price_pence
      from job_payments p
      join client_quotes cq on cq.id = p.client_quote_id
      join contractor_quotes ctq on ctq.id = cq.contractor_quote_id
     where p.status in ('paid','partially_refunded','refunded')
  )
select jsonb_build_object(

  -- ── Funnel ──────────────────────────────────────────────────────────────
  'funnel', jsonb_build_object(
    'landing_views_30d', (select count(*) from landing_views where created_at >= (select t from since30)),
    'started_30d',       (select count(*) from job_submissions where created_at >= (select t from since30)),
    'confirmed_30d',     (select count(*) from js where confirmed_at >= (select t from since30)),
    'distributed_30d',   (select count(*) from js where confirmed_at >= (select t from since30) and status not in ('confirmed','no_matches')),
    'priced_30d',        (select count(distinct submission_id) from client_quotes cq join js on js.id = cq.submission_id where js.confirmed_at >= (select t from since30)),
    'paid_30d',          (select count(distinct submission_id) from money m join js on js.id = m.submission_id where js.confirmed_at >= (select t from since30)),
    'completed_30d',     (select count(*) from js where confirmed_at >= (select t from since30) and status in ('completed','paid')),
    'confirmed_all',     (select count(*) from js),
    'paid_all',          (select count(distinct submission_id) from money),
    'completed_all',     (select count(*) from js where status in ('completed','paid'))
  ),

  -- ── Live pipeline ───────────────────────────────────────────────────────
  'pipeline', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from
                 (select status, count(*) n from js
                   where status not in ('completed','paid','cancelled','no_matches','no_quotes','expired')
                   group by status) t),
  'attention', jsonb_build_object(
    'awaiting_customer_confirm', (select count(*) from js where status = 'completed_by_contractor'),
    'awaiting_payment',          (select count(*) from js where status = 'accepted_awaiting_payment'),
    'no_matches',                (select count(*) from js where status = 'no_matches'),
    'no_quotes_48h',             (select count(*) from js where status = 'distributed' and distributed_at < now() - interval '48 hours'),
    'awaiting_invoice',          (select count(*) from js where status in ('completed','paid') and contractor_invoice_path is null),
    'invoices_to_pay',           (select count(*) from js where status in ('completed','paid') and contractor_invoice_path is not null)
  ),

  -- ── Money ───────────────────────────────────────────────────────────────
  'money', jsonb_build_object(
    'gross_pence_30d',   (select coalesce(sum(amount_pence),0) from money where paid_at >= (select t from since30)),
    'gross_pence_all',   (select coalesce(sum(amount_pence),0) from money),
    'margin_pence_30d',  (select coalesce(sum(client_price_pence - contractor_price_pence),0) from money where paid_at >= (select t from since30)),
    'margin_pence_all',  (select coalesce(sum(client_price_pence - contractor_price_pence),0) from money),
    'refunded_pence_all',(select coalesce(sum(refunded_pence),0) from money),
    'payouts_owed_pence',(select coalesce(sum(m.contractor_price_pence),0) from money m join js on js.id = m.submission_id where js.status in ('completed','paid')),
    'held_pence',        (select coalesce(sum(m.contractor_price_pence),0) from money m join js on js.id = m.submission_id where js.status in ('awarded','contacted','scheduled','in_progress','completed_by_contractor')),
    'avg_job_pence',     (select coalesce(avg(amount_pence),0)::int from money)
  ),

  -- ── People ──────────────────────────────────────────────────────────────
  'customers', jsonb_build_object(
    'total',        (select count(*) from customers),
    'new_30d',      (select count(*) from customers where created_at >= (select t from since30)),
    'with_a_job',   (select count(distinct customer_id) from js where customer_id is not null),
    'repeat',       (select count(*) from (select customer_id from js where customer_id is not null group by customer_id having count(*) > 1) r),
    'schedules_active', (select count(*) from job_schedules where active),
    'unclaimed_jobs',   (select count(*) from js where customer_id is null and contact_email is not null)
  ),
  'contractors', jsonb_build_object(
    'total',        (select count(*) from contractors),
    'approved',     (select count(*) from contractors where status = 'approved'),
    'vetted',       (select count(*) from contractors where status = 'approved' and vetted_at is not null),
    'pending',      (select count(*) from contractors where status = 'pending'),
    'suspended',    (select count(*) from contractors where status = 'suspended'),
    'new_30d',      (select count(*) from contractors where created_at >= (select t from since30)),
    'invited_30d',  (select count(distinct contractor_id) from job_invitations where sent_at >= (select t from since30)),
    'priced_30d',   (select count(distinct contractor_id) from contractor_quotes where created_at >= (select t from since30)),
    'won_30d',      (select count(distinct awarded_contractor_id) from js where awarded_at >= (select t from since30)),
    'rating_avg',   (select round(avg(stars)::numeric, 2) from contractor_ratings),
    'ratings',      (select count(*) from contractor_ratings)
  ),

  -- ── Response ────────────────────────────────────────────────────────────
  'response', jsonb_build_object(
    'invite_to_first_price_median_hours', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (cq.created_at - i.sent_at))/3600))::numeric, 1)
        from contractor_quotes cq join job_invitations i on i.id = cq.invitation_id),
    'invites_per_job', (select round(avg(n)::numeric,1) from (select count(*) n from job_invitations group by submission_id) t),
    'prices_per_job',  (select round(avg(n)::numeric,1) from (select count(*) n from client_quotes group by submission_id) t),
    'decline_rate_pct',(select case when count(*)=0 then null else round(100.0*count(*) filter (where status='declined')/count(*),0) end from job_invitations)
  ),

  -- ── Locations ───────────────────────────────────────────────────────────
  -- Demand and supply side by side per county, so the gaps show.
  'counties', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'region', c.region,
      'jobs', coalesce(j.jobs,0), 'jobs_30d', coalesce(j.jobs_30d,0),
      'no_matches', coalesce(j.no_matches,0),
      'paid_pence', coalesce(j.paid_pence,0),
      'contractors', coalesce(k.contractors,0),
      'customers', coalesce(j.customers,0)
    ) order by coalesce(j.jobs,0) desc, coalesce(k.contractors,0) desc, c.name), '[]'::jsonb)
    from counties c
    left join (
      select js.county_id,
             count(*) jobs,
             count(*) filter (where js.confirmed_at >= (select t from since30)) jobs_30d,
             count(*) filter (where js.status = 'no_matches') no_matches,
             count(distinct js.customer_id) customers,
             coalesce(sum(m.amount_pence),0) paid_pence
        from js left join money m on m.submission_id = js.id
       group by js.county_id) j on j.county_id = c.id
    left join (
      select cc.county_id, count(*) contractors
        from contractor_counties cc join contractors ct on ct.id = cc.contractor_id
       where ct.status = 'approved' and ct.vetted_at is not null
       group by cc.county_id) k on k.county_id = c.id
    where coalesce(j.jobs,0) > 0 or coalesce(k.contractors,0) > 0
  ),
  'unplaced_jobs', (select count(*) from js where county_id is null),

  -- ── Trend: confirmed jobs per week, last 12 weeks ────────────────────────
  'weekly', (
    select coalesce(jsonb_agg(jsonb_build_object('week', w, 'jobs', coalesce(n,0), 'paid', coalesce(p,0)) order by w), '[]'::jsonb)
    from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') w
    left join (select date_trunc('week', confirmed_at) wk, count(*) n from js group by 1) a on a.wk = w
    left join (select date_trunc('week', paid_at) wk, count(*) p from money group by 1) b on b.wk = w
  ),

  -- ── Email health, last 7 days ────────────────────────────────────────────
  'email', jsonb_build_object(
    'sent_7d',      (select count(*) from pending_emails where status='sent' and created_at >= (select t from since7)),
    'delivered_7d', (select count(*) from pending_emails where delivery_status='delivered' and created_at >= (select t from since7)),
    'bounced_7d',   (select count(*) from pending_emails where delivery_status in ('bounced','failed','suppressed') and created_at >= (select t from since7)),
    'pending',      (select count(*) from pending_emails where status='pending'),
    'failed',       (select count(*) from pending_emails where status='failed')
  ),

  -- ── The old board, until it is switched off ─────────────────────────────
  'legacy', jsonb_build_object(
    'board_jobs_open', (select count(*) from jobs where status = 'open'),
    'board_jobs_total',(select count(*) from jobs)
  ),

  'generated_at', now()
);
$$;

-- Operator data. The old admin_metrics was executable by anon and authenticated,
-- which handed job and contractor counts to anyone who asked the API; neither
-- function needs that.
revoke execute on function admin_dashboard() from public, anon, authenticated;
grant  execute on function admin_dashboard() to service_role;
revoke execute on function admin_metrics()   from public, anon, authenticated;
grant  execute on function admin_metrics()   to service_role;
