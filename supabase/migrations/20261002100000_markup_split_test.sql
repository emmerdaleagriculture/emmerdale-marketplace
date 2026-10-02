-- ============================================================================
-- Commission split test: 5% or 15%, decided per job.
--
-- The markup has been one number for everyone (app_config sq_markup_rate,
-- 0.10). To learn what the rate does to booking, each new job is put in an
-- arm the first time a price is published for it, and every price on that
-- job carries that arm's rate. Extra work and repeats inherit the parent
-- job's rate: the same customer should not see two commissions.
--
-- Jobs priced before this existed are stamped with the rate their prices
-- already carry (0.10) and no arm, so they stay consistent and out of the
-- test. sq_publish_quote is the single place the rate was read; it now
-- asks sq_job_markup_rate. Off switch: sq_markup_test_enabled = 0, after
-- which new jobs take sq_markup_rate as before (jobs already in an arm keep
-- their rate).
--
-- /admin/metrics shows the arms side by side (admin_markup_test_summary).
-- ============================================================================

insert into app_config (key, value) values
  ('sq_markup_test_enabled', '1'),
  ('sq_markup_test_arms', '{"a": 0.05, "b": 0.15}')
on conflict (key) do nothing;

alter table job_submissions
  add column if not exists markup_rate numeric check (markup_rate >= 0 and markup_rate <= 1),
  add column if not exists markup_arm text check (markup_arm in ('a', 'b')),
  add column if not exists markup_assigned_at timestamptz;
create index if not exists job_submissions_markup_arm_idx on job_submissions (markup_arm) where markup_arm is not null;

-- Already priced: the rate those prices carry, and no arm.
update job_submissions js
   set markup_rate = q.rate, markup_assigned_at = q.first_at
  from (select submission_id, max(markup_rate) as rate, min(created_at) as first_at
          from client_quotes group by submission_id) q
 where q.submission_id = js.id and js.markup_rate is null;

-- The rate for a job, assigning one if it has none yet. Called with the job
-- row already locked by the quote path (submit_contractor_quote holds it
-- FOR UPDATE); locked here too for any other caller.
create or replace function sq_job_markup_rate(p_submission_id uuid) returns numeric
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js    job_submissions%rowtype;
  v_rate  numeric;
  v_arm   text;
  v_arms  jsonb;
  v_parent uuid;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return app_config_num('sq_markup_rate', 0.10); end if;
  if v_js.markup_rate is not null then return v_js.markup_rate; end if;

  -- Extra work and repeats: the parent job's rate, arm and all.
  v_parent := coalesce(v_js.extra_work_of, v_js.repeat_of);
  if v_parent is not null then
    select markup_rate, markup_arm into v_rate, v_arm from job_submissions where id = v_parent;
  end if;

  if v_rate is null then
    v_arms := (select value from app_config where key = 'sq_markup_test_arms');
    if app_config_num('sq_markup_test_enabled', 0) = 1
       and jsonb_typeof(v_arms->'a') = 'number' and jsonb_typeof(v_arms->'b') = 'number' then
      v_arm := case when random() < 0.5 then 'a' else 'b' end;
      v_rate := (v_arms->>v_arm)::numeric;
    else
      v_arm := null;
      v_rate := app_config_num('sq_markup_rate', 0.10);
    end if;
  end if;

  update job_submissions
     set markup_rate = v_rate, markup_arm = v_arm, markup_assigned_at = now()
   where id = p_submission_id;
  perform log_job_event(p_submission_id, 'markup_assigned', null, null, 'system', null,
    case when v_arm is null then 'standing rate'
         when v_parent is not null then 'inherited from the parent job'
         else 'split test' end,
    jsonb_build_object('rate', v_rate, 'arm', v_arm, 'parent', v_parent));
  return v_rate;
end;
$$;

-- ── sq_publish_quote: the live definition, one line changed ─────────────
CREATE OR REPLACE FUNCTION public.sq_publish_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cq contractor_quotes%rowtype;
  v_js job_submissions%rowtype;
  v_rate numeric;
  v_label text;
  v_ct contractors%rowtype;
begin
  select * into v_cq from contractor_quotes where id = p_quote_id;
  select * into v_js from job_submissions where id = v_cq.submission_id;
  select * into v_ct from contractors where id = v_cq.contractor_id;
  -- The job's own rate: assigned on its first price (a split-test arm, or
  -- the standing rate), and the same for every price on the job after.
  v_rate := sq_job_markup_rate(v_cq.submission_id);

  -- Stable label, shared with the message thread: a contractor who asked the
  -- customer a question before pricing already has one (20260925140000).
  v_label := sq_invitation_label(v_cq.invitation_id);

  insert into client_quotes (
    submission_id, contractor_quote_id, contractor_id,
    client_price_pence, markup_rate,
    client_rate_value_pence, client_rate_minimum_pence,
    contractor_display_label, contractor_rating_avg, contractor_rating_count,
    distance_miles, site_visit_required, valid_until, price_basis,
    contractor_note, unit_label, unit_quantity
  )
  select
    v_cq.submission_id, v_cq.id, v_cq.contractor_id,
    client_price_pence(v_cq.contractor_price_pence, v_rate), v_rate,
    -- Rate quotes: the rate itself is marked up to the penny (ceil); the
    -- headline indicative total above gets the full ceil-to-£5 treatment.
    case when v_cq.rate_value_pence is not null
         then ceil(v_cq.rate_value_pence * (1 + v_rate))::int end,
    case when v_cq.rate_minimum_pence is not null
         then ceil(v_cq.rate_minimum_pence * (1 + v_rate))::int end,
    v_label, v_ct.rating_avg, v_ct.rating_count,
    i.distance_miles, v_cq.site_visit_required, v_cq.valid_until, v_cq.price_basis,
    v_cq.note_to_client,
    -- Carried so the customer sees "£12 per bale × 20", not a bare total with
    -- no way to tell how it was arrived at.
    v_cq.unit_label, v_cq.unit_quantity
  from job_invitations i where i.id = v_cq.invitation_id;

  update job_invitations set status = 'priced' where id = v_cq.invitation_id;

  perform log_job_event(v_cq.submission_id, 'quote_received', null, null, 'contractor',
    v_cq.contractor_id, null,
    jsonb_build_object('quote_id', v_cq.id,
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate)));

  -- First price → quotes_receiving + immediate client email (§16a.1).
  -- The note deliberately does NOT go in this email: email cannot be
  -- retracted and toHtml() linkifies anything that looks like a URL.
  if v_js.status = 'distributed' then
    update job_submissions set status = 'quotes_receiving', quotes_notified_at = now()
     where id = v_js.id;
    perform log_job_event(v_js.id, 'status_change', 'distributed', 'quotes_receiving',
      'system', null, null, '{}');
    insert into pending_emails (kind, to_email, payload)
    values ('sq_first_quote', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate),
      'contractor_label', v_label,
      'price_basis', v_cq.price_basis,
      'contact_name', v_js.contact_name,
      'sole_offer', v_js.first_refusal and v_js.market_opens_at is not null
                    and v_js.preferred_contractor_id = v_cq.contractor_id));
  end if;
end;
$function$;

-- ── The arms, side by side, for the dashboard ───────────────────────────
create or replace function admin_markup_test_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with arm as (
    select js.markup_arm, js.markup_rate, js.id, js.status, js.awarded_at, js.markup_assigned_at,
           (select count(*) from client_quotes q where q.submission_id = js.id) as prices,
           (select min(created_at) from client_quotes q where q.submission_id = js.id) as first_price_at,
           cq.client_price_pence as booked_client_pence,
           ccq.contractor_price_pence as booked_contractor_pence
      from job_submissions js
      left join client_quotes cq on cq.id = js.accepted_client_quote_id
      left join contractor_quotes ccq on ccq.id = cq.contractor_quote_id
     where js.markup_arm is not null and js.hidden_at is null
  ),
  per as (
    select markup_arm,
      max(markup_rate) as rate,
      count(*) as jobs,
      count(*) filter (where prices > 0) as priced,
      sum(prices) as prices,
      count(*) filter (where awarded_at is not null) as booked,
      count(*) filter (where status in ('completed', 'paid')) as completed,
      count(*) filter (where status = 'cancelled') as cancelled,
      count(*) filter (where status in ('expired', 'no_quotes')) as lapsed,
      round(avg(booked_client_pence) filter (where awarded_at is not null)) as avg_client_pence,
      round(avg(booked_contractor_pence) filter (where awarded_at is not null)) as avg_contractor_pence,
      coalesce(sum(booked_client_pence - booked_contractor_pence) filter (where awarded_at is not null), 0) as margin_pence,
      round((percentile_cont(0.5) within group (order by extract(epoch from awarded_at - first_price_at) / 86400)
             filter (where awarded_at is not null and first_price_at is not null))::numeric, 1) as median_days_to_book,
      min(markup_assigned_at) as since
    from arm group by markup_arm
  )
  select jsonb_build_object(
    'enabled', app_config_num('sq_markup_test_enabled', 0) = 1,
    -- The configured rates, so the page can show both arms before either has a job.
    'rates', coalesce((select value from app_config where key = 'sq_markup_test_arms'), '{}'::jsonb),
    'arms', coalesce((select jsonb_object_agg(markup_arm, to_jsonb(per) - 'markup_arm') from per), '{}'::jsonb),
    'since', (select min(since) from per),
    'generated_at', now())
$$;

revoke execute on function sq_job_markup_rate(uuid)      from public, anon, authenticated;
revoke execute on function admin_markup_test_summary()   from public, anon, authenticated;
grant  execute on function admin_markup_test_summary()   to service_role;
