-- ============================================================================
-- One place that decides what a job is CALLED in an email.
--
-- service_id is null on 23 of 24 live submissions — routing went county-only
-- (8e86e71), so almost nothing gets classified any more. Every payload that
-- looked the name up off service_id has therefore been sending null, and the
-- templates have been falling back to "land work", or to an empty string that
-- renders as "About your  job" with two spaces.
--
-- The obvious fix — fall back to service_verbatim — is worse than the bug.
-- That column holds the customer's own words, and on live rows it runs from 13
-- to 1261 characters (mean 110). Eleven of the twenty-three read as a service
-- name ("Hedge cutting", "Paddock topping"); the rest are prose ("Rolling need
-- assistance with rolling winter drilled crops due to break…"). Six of these
-- call sites feed an email SUBJECT line.
--
-- So: classified name when there is one; otherwise the customer's words but
-- ONLY when they are short enough to be a name; otherwise null, which leaves
-- each template's own fallback in charge — "land work" to a contractor, "the
-- job" on a confirmation, "your job" in a nudge. Null is the point. A single
-- generic literal here would override all of them with the wrong register.
--
-- 40 characters is the cut. The longest real row in `services` is 22, and 40
-- keeps all eleven usable verbatims while dropping every prose one.
-- ============================================================================

create or replace function sq_service_label(p_service_id integer, p_verbatim text)
returns text
-- STABLE, not IMMUTABLE: it reads `services`. No grants are revoked — service
-- names are public and the verbatim is passed in by the caller, so this exposes
-- nothing the caller did not already hold.
language sql stable as $$
  select coalesce(
    (select s.name from services s where s.id = p_service_id),
    (select v from (
       select btrim(regexp_replace(coalesce(p_verbatim, ''), '\s+', ' ', 'g')) as v
     ) t where length(t.v) between 1 and 40)
  );
$$;

comment on function sq_service_label(integer, text) is
  'What to call a job in an email: classified service name, else the customer''s own words when short enough to read as a name (<=40 chars), else null so the template''s own fallback applies.';

CREATE OR REPLACE FUNCTION public.sq_job_facts(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'submission_id', js.id,
    'service', sq_service_label(js.service_id, js.service_verbatim),
    'description', coalesce(nullif(btrim(js.service_verbatim), ''), js.raw_text),
    'county', c.name,
    'postcode_district', split_part(js.postcode, ' ', 1),
    'area_value', js.area_value,
    'area_unit', js.area_unit,
    'area_mapped_value', js.area_mapped_value,
    'urgency', js.urgency,
    'target_date', js.target_date,
    'access_notes', js.access_notes,
    'obstacles', js.obstacles,
    'gate_width', js.gate_width,
    'expires_at', js.expires_at
  )
  from job_submissions js
  left join counties c on c.id = js.county_id
  where js.id = p_submission_id;
$function$;


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
  v_n int;
  v_ct contractors%rowtype;
begin
  select * into v_cq from contractor_quotes where id = p_quote_id;
  select * into v_js from job_submissions where id = v_cq.submission_id;
  select * into v_ct from contractors where id = v_cq.contractor_id;
  v_rate := app_config_num('sq_markup_rate', 0.10);

  -- Stable label: reuse this contractor's existing label on this submission,
  -- else allocate the next in arrival order.
  select contractor_display_label into v_label
    from client_quotes
   where submission_id = v_cq.submission_id and contractor_id = v_cq.contractor_id
   limit 1;
  if v_label is null then
    select count(distinct contractor_id) + 1 into v_n
      from client_quotes where submission_id = v_cq.submission_id;
    v_label := 'Contractor ' || case when v_n <= 26 then chr(64 + v_n) else v_n::text end;
  end if;

  insert into client_quotes (
    submission_id, contractor_quote_id, contractor_id,
    client_price_pence, markup_rate,
    client_rate_value_pence, client_rate_minimum_pence,
    contractor_display_label, contractor_rating_avg, contractor_rating_count,
    distance_miles, site_visit_required, valid_until
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
    i.distance_miles, v_cq.site_visit_required, v_cq.valid_until
  from job_invitations i where i.id = v_cq.invitation_id;

  update job_invitations set status = 'priced' where id = v_cq.invitation_id;

  perform log_job_event(v_cq.submission_id, 'quote_received', null, null, 'contractor',
    v_cq.contractor_id, null,
    jsonb_build_object('quote_id', v_cq.id,
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate)));

  -- First price → quotes_receiving + immediate client email (§16a.1).
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
      'contact_name', v_js.contact_name,
      'sole_offer', v_js.first_refusal and v_js.market_opens_at is not null
                    and v_js.preferred_contractor_id = v_cq.contractor_id));
  end if;
end;
$function$;


CREATE OR REPLACE FUNCTION public.sealed_quote_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_batch_hours numeric;
begin
  -- 1) Distribution backstop: a crashed confirm action must not strand a job
  --    (§30 flags undistributed at 15 min; this catches it at 5).
  for r in
    select id from job_submissions
     where status = 'confirmed'
       and confirmed_at < now() - interval '5 minutes'
     for update skip locked
  loop
    perform distribute_submission(r.id);
  end loop;

  -- 2) 7-day expiry (§16a backstop). no_quotes (zero confirmed quotes)
  --    notifies the client; expired is silent — no chase (§20). A job
  --    awaiting payment expires only once its payment link has also lapsed.
  for r in
    select js.* from job_submissions js
     where (js.status in ('distributed','quotes_receiving') and js.expires_at <= now())
        or (js.status = 'accepted_awaiting_payment' and js.expires_at <= now()
            and not exists (select 1 from job_payments p
                             where p.submission_id = js.id and p.status = 'pending'
                               and p.expires_at > now()))
     for update skip locked
  loop
    if exists (select 1 from contractor_quotes cq
                where cq.submission_id = r.id and cq.confirmed_by_contractor) then
      update job_submissions set status = 'expired' where id = r.id;
      perform log_job_event(r.id, 'status_change', r.status, 'expired', 'system', null, null, '{}');
    else
      update job_submissions set status = 'no_quotes' where id = r.id;
      perform log_job_event(r.id, 'status_change', r.status, 'no_quotes', 'system', null, null, '{}');
      perform sq_notify_once(r.id, coalesce(r.contact_email,'unknown'), 'sq_no_quotes_closed',
        r.contact_email, jsonb_build_object(
          'contact_name', r.contact_name,
          'service', sq_service_label(r.service_id, r.service_verbatim),
          'county', (select name from counties where id = r.county_id),
          'invited', (select count(*) from job_invitations where submission_id = r.id)));
    end if;
    update job_invitations ji set status = 'closed_stale'
     where ji.submission_id = r.id and ji.status in ('sent','viewed','priced');
    insert into invitation_events (invitation_id, contractor_id, event_type)
    select id, contractor_id, 'closed_stale' from job_invitations
     where submission_id = r.id and status = 'closed_stale'
       and not exists (select 1 from invitation_events e
                        where e.invitation_id = job_invitations.id and e.event_type = 'closed_stale');
    update client_quotes set status = 'closed'
     where submission_id = r.id and status in ('active','superseded','accepted');
  end loop;

  -- 3) Payment-link expiry safety net (webhook normally wins; 10-min grace).
  for r in
    select stripe_checkout_session_id from job_payments
     where status = 'pending' and expires_at <= now() - interval '10 minutes'
     for update skip locked
  loop
    perform void_acceptance(r.stripe_checkout_session_id);
  end loop;

  -- 4) Batched client digests: at most one per sq_client_quote_batch_hours (§16a.1).
  v_batch_hours := app_config_num('sq_client_quote_batch_hours', 6);
  for r in
    select js.*,
           (select count(*) from client_quotes q
             where q.submission_id = js.id and q.status = 'active'
               and q.created_at > js.quotes_notified_at) as new_count,
           (select count(*) from client_quotes q
             where q.submission_id = js.id and q.status = 'active') as total_count
      from job_submissions js
     where js.status = 'quotes_receiving'
       and js.quotes_notified_at is not null
       and js.quotes_notified_at < now() - make_interval(hours => v_batch_hours::int)
     for update skip locked
  loop
    if r.new_count > 0 then
      update job_submissions set quotes_notified_at = now() where id = r.id;
      insert into pending_emails (kind, to_email, payload)
      values ('sq_new_quotes', r.contact_email, jsonb_build_object(
        'client_token', r.client_token, 'new_count', r.new_count,
        'total_count', r.total_count, 'contact_name', r.contact_name));
    end if;
  end loop;

  -- 5) 48h with zero quotes: reassure the client, alert the operator (§30).
  for r in
    select js.* from job_submissions js
     where js.status = 'distributed'
       and js.distributed_at < now() - make_interval(hours => app_config_num('sq_no_quotes_alert_hours', 48)::int)
     for update skip locked
  loop
    perform sq_notify_once(r.id, coalesce(r.contact_email,'unknown'), 'sq_no_quotes_yet',
      r.contact_email, jsonb_build_object('client_token', r.client_token,
        'contact_name', r.contact_name,
        'service', sq_service_label(r.service_id, r.service_verbatim),
        'county', (select name from counties where id = r.county_id)));
    perform sq_notify_once(r.id, '__admin__', 'sq_no_quotes_yet', '__admin__',
      jsonb_build_object('submission_id', r.id,
        'county', (select name from counties where id = r.county_id)));
  end loop;
end;

$function$;


CREATE OR REPLACE FUNCTION public.award_submission(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pay job_payments%rowtype;
  v_js job_submissions%rowtype;
  v_q client_quotes%rowtype;
  v_cq contractor_quotes%rowtype;
  v_ct contractors%rowtype;
  v_inv record;
begin
  select * into v_pay from job_payments where stripe_checkout_session_id = p_session_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_session'); end if;
  if v_pay.status = 'paid' then return jsonb_build_object('ok', true, 'idempotent', true); end if;

  select * into v_js from job_submissions where id = v_pay.submission_id for update;

  -- Duplicate webhook deliveries race to this lock: re-read the payment now
  -- that we hold it, so the loser takes the idempotent path rather than
  -- firing a false MANUAL REFUND alert.
  select * into v_pay from job_payments where id = v_pay.id;
  if v_pay.status = 'paid' then return jsonb_build_object('ok', true, 'idempotent', true); end if;

  update job_payments set status = 'paid', paid_at = now() where id = v_pay.id;
  select * into v_q from client_quotes where id = v_pay.client_quote_id;

  if v_js.status = 'accepted_awaiting_payment' and v_js.accepted_client_quote_id = v_pay.client_quote_id then
    null; -- happy path
  elsif v_js.status = 'quotes_receiving' and v_q.status in ('active','accepted') then
    update job_submissions set accepted_client_quote_id = v_q.id where id = v_js.id;
    update client_quotes set status = 'accepted' where id = v_q.id;
  else
    perform sq_notify_once(v_js.id, '__admin__', 'sq_payment_needs_refund', '__admin__',
      jsonb_build_object('submission_id', v_js.id, 'session_id', p_session_id,
                         'amount_pence', v_pay.amount_pence, 'job_status', v_js.status));
    return jsonb_build_object('ok', false, 'reason', 'job_closed_manual_refund');
  end if;

  select * into v_cq from contractor_quotes where id = v_q.contractor_quote_id;
  select * into v_ct from contractors where id = v_q.contractor_id;

  update job_submissions
     set status = 'awarded', awarded_at = now(), awarded_contractor_id = v_q.contractor_id
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'awarded', 'system', null, null,
    jsonb_build_object('session_id', p_session_id, 'client_quote_id', v_q.id));
  perform log_job_event(v_js.id, 'payment_cleared', null, null, 'system', null, null,
    jsonb_build_object('amount_pence', v_pay.amount_pence));

  update client_quotes set contractor_real_name = v_ct.business_name, status = 'accepted'
   where id = v_q.id;

  for v_inv in
    select * from job_invitations
     where submission_id = v_js.id and contractor_id <> v_q.contractor_id
       and status in ('sent','viewed','priced')
  loop
    update job_invitations set status = 'closed_awarded' where id = v_inv.id;
    insert into invitation_events (invitation_id, contractor_id, event_type)
    values (v_inv.id, v_inv.contractor_id, 'closed_awarded');
    perform sq_notify_once(v_js.id, v_inv.contractor_id::text, 'sq_award_lost',
      (select email from contractors where id = v_inv.contractor_id),
      jsonb_build_object('service', sq_service_label(v_js.service_id, v_js.service_verbatim),
                         'postcode_district', split_part(v_js.postcode, ' ', 1)));
  end loop;
  update client_quotes set status = 'closed'
   where submission_id = v_js.id and id <> v_q.id and status in ('active','superseded');

  perform log_job_event(v_js.id, 'contact_released', null, null, 'system', null, null,
    jsonb_build_object('contractor_id', v_q.contractor_id,
                       'fields', jsonb_build_array('name','phone','email','postcode','w3w')));

  perform sq_notify_once(v_js.id, v_q.contractor_id::text, 'sq_award_won', v_ct.email,
    jsonb_build_object(
      'submission_id', v_js.id,
      'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
      'contact_name', v_js.contact_name,
      'contact_phone', v_js.contact_phone,
      'contact_email', v_js.contact_email,
      'postcode', v_js.postcode,
      'gate_w3w', v_js.gate_w3w,
      'contractor_price_pence', v_cq.contractor_price_pence));

  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_award_client',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contractor_business_name', v_ct.business_name,
      'contact_name', v_js.contact_name));

  return jsonb_build_object('ok', true, 'awarded_to', v_q.contractor_id);
end;
$function$;


CREATE OR REPLACE FUNCTION public.submit_contractor_quote(p_token text, p_quote_type text, p_price_pence integer, p_rate_value_pence integer, p_rate_minimum_pence integer, p_site_visit boolean, p_notes text, p_valid_until date, p_source text, p_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv job_invitations%rowtype;
  v_js job_submissions%rowtype;
  v_prior contractor_quotes%rowtype;
  v_prior_cq_status text;
  v_acres numeric;
  v_price int;
  v_new_id uuid;
  v_confirm_token text;
begin
  select * into v_inv from job_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_js from job_submissions where id = v_inv.submission_id for update;

  if v_js.status not in ('distributed','quotes_receiving','accepted_awaiting_payment') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if v_inv.status in ('declined','closed_awarded','closed_stale') then
    return jsonb_build_object('ok', false, 'reason', 'declined');
  end if;
  if p_quote_type not in ('total','rate') then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;

  if p_quote_type = 'rate' then
    if p_rate_value_pence is null or p_rate_value_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_rate');
    end if;
    v_acres := coalesce(v_js.area_mapped_value,
                        case when v_js.area_unit = 'acres' then v_js.area_value end);
    if v_acres is null or v_acres <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'rate_needs_area');
    end if;
    v_price := greatest(round(p_rate_value_pence * v_acres)::int,
                        coalesce(p_rate_minimum_pence, 0));
  else
    if p_price_pence is null or p_price_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_price');
    end if;
    v_price := p_price_pence;
  end if;

  if p_valid_until is not null and v_js.expires_at is not null
     and p_valid_until > v_js.expires_at::date then
    p_valid_until := v_js.expires_at::date;
  end if;

  select * into v_prior from contractor_quotes
   where submission_id = v_js.id and contractor_id = v_inv.contractor_id
     and superseded_by is null and confirmed_by_contractor
   order by created_at desc limit 1;

  -- A price the client has accepted and is paying for cannot be revised out
  -- from under them; it frees up if the payment link lapses.
  if v_prior.id is not null then
    select status into v_prior_cq_status
      from client_quotes where contractor_quote_id = v_prior.id;
    if v_prior_cq_status = 'accepted' then
      return jsonb_build_object('ok', false, 'reason', 'accepted_pending_payment');
    end if;
  end if;

  if p_confirmed = false then v_confirm_token := sq_token(); end if;

  -- Supersession happens ONLY for confirmed submissions. An unconfirmed
  -- email-parse must never remove a live price from the client's list —
  -- confirm_email_quote supersedes at confirmation time instead.
  if coalesce(p_confirmed, true) and v_prior.id is not null then
    -- Park the prior on a self-reference first (one-live-quote partial index).
    update contractor_quotes set superseded_by = v_prior.id where id = v_prior.id;
  end if;

  insert into contractor_quotes (
    submission_id, contractor_id, invitation_id, quote_type,
    contractor_price_pence, rate_value_pence, rate_minimum_pence,
    notes_internal, site_visit_required, valid_until,
    source, confirmed_by_contractor, confirm_token
  ) values (
    v_js.id, v_inv.contractor_id, v_inv.id, p_quote_type,
    v_price, p_rate_value_pence, p_rate_minimum_pence,
    nullif(trim(coalesce(p_notes,'')), ''), coalesce(p_site_visit, false),
    coalesce(p_valid_until, coalesce(v_js.expires_at::date, current_date + 7)),
    p_source, coalesce(p_confirmed, true), v_confirm_token
  ) returning id into v_new_id;

  if coalesce(p_confirmed, true) and v_prior.id is not null then
    update contractor_quotes set superseded_by = v_new_id where id = v_prior.id;
    update client_quotes set status = 'superseded'
     where contractor_quote_id = v_prior.id and status = 'active';
    insert into invitation_events (invitation_id, contractor_id, event_type)
    values (v_inv.id, v_inv.contractor_id, 'revised');
  else
    insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
    values (v_inv.id, v_inv.contractor_id,
            case when coalesce(p_confirmed, true) then 'priced' else 'confirm_pending' end,
            jsonb_build_object('time_to_price_seconds',
              extract(epoch from now() - v_inv.sent_at)::int));
  end if;

  if coalesce(p_confirmed, true) then
    perform sq_publish_quote(v_new_id);
    return jsonb_build_object('ok', true, 'quote_id', v_new_id);
  end if;

  insert into pending_emails (kind, to_email, payload)
  select 'sq_quote_confirm', ct.email, jsonb_build_object(
    'confirm_token', v_confirm_token,
    'amount_pence', v_price,
    'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
    'postcode_district', split_part(v_js.postcode, ' ', 1))
  from contractors ct where ct.id = v_inv.contractor_id;
  return jsonb_build_object('ok', true, 'quote_id', v_new_id, 'pending_confirm', true);
end;
$function$;


CREATE OR REPLACE FUNCTION public.send_chase_emails()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r          record;
  v_email    text;
  v_done_at  timestamptz;
  v_confirm  int := 0;
  v_invoice  int := 0;
  v_nudge1   int := 0;
  v_nudge2   int := 0;
begin
  -- ── 1. Customer has not confirmed ──────────────────────────────────────
  -- Two working days in, one before auto-confirm carries it.
  for r in
    select * from job_submissions
     where status = 'completed_by_contractor'
       and completed_by_contractor_at is not null
       and working_days_since(completed_by_contractor_at) >= 2
       and contact_email is not null
  loop
    begin
      perform sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
        'sq_completion_confirm_chase', r.contact_email,
        jsonb_build_object(
          'client_token', r.client_token,
          'contact_name', r.contact_name,
          'contractor_business_name',
            (select business_name from contractors where id = r.awarded_contractor_id)));
      v_confirm := v_confirm + 1;
    exception when others then
      raise warning 'confirm chase failed for %: %', r.id, sqlerrm;
    end;
  end loop;

  -- ── 2. Contractor has not invoiced ─────────────────────────────────────
  for r in
    select * from job_submissions
     where status in ('completed', 'paid')
       and contractor_invoice_path is null
       and awarded_contractor_id is not null
  loop
    begin
      -- When the job actually completed, however it got there: the customer
      -- confirming, auto-confirm, or an operator. A job with no such event is
      -- left alone rather than chased off a guess.
      select max(created_at) into v_done_at
        from job_events
       where job_id = r.id and to_status in ('completed', 'paid');
      continue when v_done_at is null or working_days_since(v_done_at) < 3;

      select email into v_email from contractors where id = r.awarded_contractor_id;
      if v_email is not null then
        perform sq_notify_once(r.id, v_email, 'sq_invoice_chase', v_email,
          jsonb_build_object(
            'contact_name', r.contact_name,
            'service', sq_service_label(r.service_id, r.service_verbatim),
            'postcode_district', split_part(r.postcode, ' ', 1)));
        v_invoice := v_invoice + 1;
      end if;
    exception when others then
      raise warning 'invoice chase failed for %: %', r.id, sqlerrm;
    end;
  end loop;

  -- ── 3 & 4. Customer has prices and has not chosen ──────────────────────
  -- One pass, two thresholds. The status guard is what stops these the moment
  -- a price is taken: accepting moves the job out of quotes_receiving, so an
  -- accepted job can never be nudged even if the cron runs a second later.
  for r in
    select js.*,
           (now()::date - js.quotes_notified_at::date) as days_since,
           -- sq_service_label: the classified name, else the customer's own
           -- words when short enough to read as one, else null — and the
           -- template's own "your job" fallback takes it from there.
           sq_service_label(js.service_id, js.service_verbatim) as service_label,
           (select count(*) from client_quotes cq
             where cq.submission_id = js.id and cq.status = 'active') as quote_count,
           -- The copy says "a N% deposit". Carried in the payload so the email
           -- follows sq_deposit_rate instead of quietly lying if it changes.
           round(app_config_num('sq_deposit_rate', 0.15) * 100)::int as deposit_pct
      from job_submissions js
     where js.status = 'quotes_receiving'
       and js.quotes_notified_at is not null
       and js.contact_email is not null
       and js.accepted_client_quote_id is null
       -- There must actually be a price to chase.
       and exists (select 1 from client_quotes cq
                    where cq.submission_id = js.id and cq.status = 'active')
  loop
    begin
      if r.days_since >= 6 then
        if sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
             'sq_quotes_nudge_2', r.contact_email,
             jsonb_build_object(
               'client_token', r.client_token,
               'contact_name', r.contact_name,
               'service', r.service_label,
               'quote_count', r.quote_count,
               'deposit_pct', r.deposit_pct))
        then v_nudge2 := v_nudge2 + 1; end if;
      end if;

      -- Not elsif: a job first seen at day 7+ should get the fuller day-3 note
      -- as well, since it never received one. sq_notify_once keeps each to one.
      if r.days_since >= 3 then
        if sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
             'sq_quotes_nudge_1', r.contact_email,
             jsonb_build_object(
               'client_token', r.client_token,
               'contact_name', r.contact_name,
               'service', r.service_label,
               'quote_count', r.quote_count,
               'deposit_pct', r.deposit_pct))
        then v_nudge1 := v_nudge1 + 1; end if;
      end if;
    exception when others then
      raise warning 'quote nudge failed for %: %', r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'confirm_chases', v_confirm,
    'invoice_chases', v_invoice,
    'quote_nudge_day3', v_nudge1,
    'quote_nudge_day6', v_nudge2);
end;
$function$;

