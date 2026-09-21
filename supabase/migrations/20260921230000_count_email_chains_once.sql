-- Count a message once, however many times we tried to send it.
--
-- A delivery retry (#86) is a NEW pending_emails row cloning the one that
-- failed — same kind, same payload, same recipient — so every count over that
-- table started double-counting the moment retries shipped. One contractor
-- could contribute sent=2, failed=1 and delivered=1 to a submission's
-- outreach figures, and bounced_7d could count a single undelivered message
-- up to three times. The messages we fought hardest to deliver read as the
-- worst problems on the page.
--
-- The fix is the same rule the outreach panel already uses: count only the
-- newest attempt in each chain — the row nothing else retries. Each chain
-- then contributes exactly one row carrying its final outcome, which is what
-- these numbers meant before retries existed.
--
-- `pending` is deliberately NOT filtered. A retry sitting in the queue is
-- genuinely pending work and its parent is already 'sent', so there is
-- nothing to double count, and hiding it would under-report the backlog.
--
-- Both bodies below are the live definitions with only that predicate added.

CREATE OR REPLACE FUNCTION public.admin_submission_board(p_limit integer DEFAULT 200, p_statuses text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc), '[]'::jsonb)
  from (
    select js.id, js.created_at, js.status, js.raw_text, js.service_verbatim,
           js.area_value, js.area_unit, js.area_mapped_value, js.postcode,
           js.urgency, js.target_date,
           js.contact_name, js.contact_phone, js.contact_email,
           js.utm_source, js.utm_campaign,
           js.confirmed_at, js.distributed_at, js.expires_at, js.awarded_at,
           cardinality(js.photo_paths) as photos,
           s.name  as service,
           c.name  as county,
           aw.business_name as awarded_to,
           aw.phone as awarded_phone,
           (select max(e.created_at) from job_events e
             where e.job_id = js.id and e.event_type = 'status_change'
               and e.to_status = js.status) as entered_at,
           inv.invited, inv.opened, inv.priced, inv.declined,
           em.sent as emails_sent, em.delivered as emails_delivered, em.failed as emails_failed,
           cq.live as quotes_live, cq.lowest as lowest_client_pence, cq.accepted as accepted_pence,
           pay.deposit_status, pay.deposit_pence,
           pay.balance_status, pay.balance_pence, pay.balance_due_at
      from job_submissions js
      left join services s     on s.id = js.service_id
      left join counties c     on c.id = js.county_id
      left join contractors aw on aw.id = js.awarded_contractor_id
      left join lateral (
        select count(*) as invited,
               count(ji.opened_at) as opened,
               count(*) filter (where exists (
                 select 1 from contractor_quotes q where q.invitation_id = ji.id)) as priced,
               count(*) filter (where ji.decline_reason is not null or ji.status = 'declined') as declined
          from job_invitations ji
         where ji.submission_id = js.id
      ) inv on true
      left join lateral (
        select count(*) filter (where pe.status = 'sent') as sent,
               count(*) filter (where pe.delivery_status = 'delivered') as delivered,
               count(*) filter (where pe.status = 'failed'
                                   or pe.delivery_status in ('bounced','complained','failed','suppressed')) as failed
          from pending_emails pe
         where pe.kind = 'sq_invitation'
           and pe.payload->>'submission_id' = js.id::text
           -- Only the newest attempt at each message. A delivery retry is a
           -- full clone of the row it retries, so counting every row would
           -- make one contractor contribute sent=2, and the message we tried
           -- hardest to deliver would read as the worst problem here.
           and not exists (select 1 from pending_emails r where r.retry_of = pe.id)
      ) em on true
      left join lateral (
        select count(*) filter (where q.status = 'active') as live,
               min(q.client_price_pence) filter (where q.status in ('active','accepted')) as lowest,
               max(q.client_price_pence) filter (where q.status = 'accepted') as accepted
          from client_quotes q
         where q.submission_id = js.id
      ) cq on true
      left join lateral (
        select (array_agg(p.status       order by p.created_at desc) filter (where p.kind = 'deposit'))[1] as deposit_status,
               (array_agg(p.amount_pence order by p.created_at desc) filter (where p.kind = 'deposit'))[1] as deposit_pence,
               (array_agg(p.status       order by p.created_at desc) filter (where p.kind = 'balance'))[1] as balance_status,
               (array_agg(p.amount_pence order by p.created_at desc) filter (where p.kind = 'balance'))[1] as balance_pence,
               (array_agg(p.due_at       order by p.created_at desc) filter (where p.kind = 'balance'))[1] as balance_due_at
          from job_payments p
         where p.submission_id = js.id
      ) pay on true
     where p_statuses is null or js.status = any (p_statuses)
     order by js.created_at desc
     limit p_limit
  ) b;
$function$;

CREATE OR REPLACE FUNCTION public.admin_dashboard()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with
  since30 as (select now() - interval '30 days' as t),
  since7  as (select now() - interval '7 days'  as t),
  -- A "job" here is a submission the customer actually confirmed. Drafts and
  -- abandoned parses are funnel leakage, counted separately.
  js as (select * from job_submissions where status not in ('draft','abandoned')),
  -- ONE ROW PER SUBMISSION, not per payment. A job now has a deposit row and
  -- a balance row, and every figure below that multiplies by a per-job price
  -- (margin, payouts owed, held, and the per-county job COUNT) would count the
  -- job twice the moment its balance opened. amount_pence is what has actually
  -- been collected across both.
  money as (
    select p.submission_id,
           sum(p.amount_pence)                as amount_pence,
           max(p.paid_at)                     as paid_at,
           sum(coalesce(p.refunded_pence, 0)) as refunded_pence,
           max(cq.client_price_pence)         as client_price_pence,
           max(ctq.contractor_price_pence)    as contractor_price_pence
      from job_payments p
      join client_quotes cq on cq.id = p.client_quote_id
      join contractor_quotes ctq on ctq.id = cq.contractor_quote_id
     where p.status in ('paid','partially_refunded','refunded')
     group by p.submission_id
  ),
  -- Owed by customers on finished jobs and not yet taken.
  outstanding as (
    select coalesce(sum(amount_pence), 0) as pence, count(*) as n
      from job_payments
     where kind = 'balance' and status in ('due', 'failed')
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
    'held_pence',        (select coalesce(sum(m.amount_pence),0) from money m join js on js.id = m.submission_id where js.status in ('awarded','contacted','scheduled','in_progress','completed_by_contractor')),
    'outstanding_pence', (select pence from outstanding),
    'outstanding_count', (select n from outstanding),
    'avg_job_pence',     (select coalesce(avg(client_price_pence),0)::int from money)
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
    'sent_7d',      (select count(*) from pending_emails pe where pe.status='sent' and pe.created_at >= (select t from since7) and not exists (select 1 from pending_emails r where r.retry_of = pe.id)),
    'delivered_7d', (select count(*) from pending_emails pe where pe.delivery_status='delivered' and pe.created_at >= (select t from since7) and not exists (select 1 from pending_emails r where r.retry_of = pe.id)),
    'bounced_7d',   (select count(*) from pending_emails pe where pe.delivery_status in ('bounced','failed','suppressed') and pe.created_at >= (select t from since7) and not exists (select 1 from pending_emails r where r.retry_of = pe.id)),
    'pending',      (select count(*) from pending_emails where status='pending'),
    'failed',       (select count(*) from pending_emails pe where pe.status='failed' and not exists (select 1 from pending_emails r where r.retry_of = pe.id))
  ),

  -- ── The old board, until it is switched off ─────────────────────────────
  'legacy', jsonb_build_object(
    'board_jobs_open', (select count(*) from jobs where status = 'open'),
    'board_jobs_total',(select count(*) from jobs)
  ),

  'generated_at', now()
);
$function$;
