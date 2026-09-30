-- ============================================================================
-- Booking with a site visit.
--
-- A contractor who can't stand behind a price without seeing the ground ticks
-- "I'd need to see the site before confirming this price" (site_visit_required,
-- which until now only printed a label). On 29 Sep 2026 the absence of any
-- way to act on that sent a customer and a contractor round the platform: a
-- phone number and a home address in the messages, and a visit arranged
-- privately before anything was booked.
--
-- Now a price like that is booked with a visit:
--
--   1. The customer books it exactly as any price — deposit, award, details
--      released — and the job is marked awaiting_visit.
--   2. The contractor visits and, from /won, confirms the price or revises it
--      (any amount, with a reason; not below the deposit already paid).
--      Silence for 7 days confirms it, after a reminder on day 5.
--   3. A revised price puts the job at variation_pending until the customer
--      accepts it (the prices change, the balance follows) or declines it
--      (the deposit comes back in full and the job is cancelled; the wasted
--      visit is the contractor's, as quoting is).
--
-- The Stripe refund on decline happens in the app before sq_visit_declined
-- records it, in that order, as cancel_job_by_client does.
-- ============================================================================

alter table job_submissions
  add column if not exists visit_status text
    check (visit_status in ('awaiting_visit', 'revised', 'confirmed', 'declined')),
  -- When silence becomes confirmation.
  add column if not exists visit_due_at timestamptz,
  add column if not exists visit_reminded_at timestamptz,
  add column if not exists visit_revised_contractor_pence int check (visit_revised_contractor_pence > 0),
  add column if not exists visit_revised_client_pence int check (visit_revised_client_pence > 0),
  add column if not exists visit_revision_reason text,
  -- Where the job was when the revision paused it, so accepting puts it back.
  add column if not exists visit_prev_status text,
  add column if not exists visit_decided_at timestamptz;

create index if not exists job_submissions_visit_due_idx
  on job_submissions (visit_due_at) where visit_status = 'awaiting_visit';

-- ── Marking a job as booked-with-a-visit ────────────────────────────────
-- A trigger rather than an edit to award_submission, which has to stay
-- exactly as it is on the money path. Also: marking the work done settles
-- the question — a contractor who did the job at the price has confirmed it.
create or replace function sq_visit_on_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'awarded' and old.status is distinct from 'awarded'
     and new.visit_status is null
     and exists (select 1 from client_quotes
                  where id = new.accepted_client_quote_id and site_visit_required) then
    new.visit_status := 'awaiting_visit';
    new.visit_due_at := now() + interval '7 days';
  end if;
  if new.status = 'completed_by_contractor' and new.visit_status = 'awaiting_visit' then
    new.visit_status := 'confirmed';
    new.visit_decided_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists job_submissions_visit_on_status on job_submissions;
create trigger job_submissions_visit_on_status
  before update of status on job_submissions
  for each row execute function sq_visit_on_status();

-- ── Contractor: the price stands ────────────────────────────────────────
create or replace function sq_visit_confirm(p_submission_id uuid, p_contractor_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js job_submissions%rowtype;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.awarded_contractor_id is distinct from p_contractor_id then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  if v_js.visit_status is distinct from 'awaiting_visit' then
    return jsonb_build_object('ok', false, 'reason', 'not_awaiting');
  end if;

  update job_submissions set visit_status = 'confirmed', visit_decided_at = now()
   where id = v_js.id;
  perform log_job_event(v_js.id, 'visit_confirmed', null, null, 'contractor', p_contractor_id,
    'price confirmed after the site visit', '{}');
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown') || ':visit',
    'sq_visit_confirmed', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contact_name', v_js.contact_name,
      'contractor_business_name', (select business_name from contractors where id = p_contractor_id),
      'auto', false));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Contractor: a new price after the visit ─────────────────────────────
create or replace function sq_visit_revise(
  p_submission_id uuid, p_contractor_id uuid, p_contractor_pence int, p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js     job_submissions%rowtype;
  v_cl     client_quotes%rowtype;
  v_client int;
  v_paid   int;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name   text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.awarded_contractor_id is distinct from p_contractor_id then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  if v_js.visit_status is distinct from 'awaiting_visit'
     or v_js.status not in ('awarded', 'contacted', 'scheduled') then
    return jsonb_build_object('ok', false, 'reason', 'not_awaiting');
  end if;
  if p_contractor_pence is null or p_contractor_pence <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_price');
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_reason');
  end if;

  select * into v_cl from client_quotes where id = v_js.accepted_client_quote_id;
  v_client := client_price_pence(p_contractor_pence, v_cl.markup_rate);

  -- A price below what the customer has already paid would need part of the
  -- deposit handed back; that is a conversation, not a button.
  select coalesce(sum(amount_pence), 0) into v_paid from job_payments
   where submission_id = v_js.id and kind = 'deposit' and status = 'paid';
  if v_client < v_paid then
    return jsonb_build_object('ok', false, 'reason', 'below_deposit',
      'min_contractor_pence', ceil(v_paid / (1 + v_cl.markup_rate))::int);
  end if;
  if v_client = v_cl.client_price_pence then
    return jsonb_build_object('ok', false, 'reason', 'same_price');
  end if;

  update job_submissions
     set visit_status = 'revised',
         visit_revised_contractor_pence = p_contractor_pence,
         visit_revised_client_pence = v_client,
         visit_revision_reason = v_reason,
         visit_prev_status = v_js.status,
         status = 'variation_pending'
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'variation_pending', 'contractor',
    p_contractor_id, 'price revised after the site visit',
    jsonb_build_object('old_client_pence', v_cl.client_price_pence, 'new_client_pence', v_client,
                       'new_contractor_pence', p_contractor_pence));

  select business_name into v_name from contractors where id = p_contractor_id;
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown') || ':visit_revised',
    'sq_visit_revised', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contact_name', v_js.contact_name,
      'contractor_business_name', v_name,
      'old_pence', v_cl.client_price_pence,
      'new_pence', v_client,
      'reason', v_reason));
  insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
    jsonb_build_object(
      'subject', 'Price revised after a site visit — ' || coalesce(v_name, 'contractor'),
      'text', coalesce(v_name, 'The contractor') || ' revised the price on job ' || v_js.id
        || ' after visiting: ' || round(v_cl.client_price_pence / 100.0, 2)
        || ' → ' || round(v_client / 100.0, 2) || E' (customer price, GBP).\n\nReason: '
        || v_reason || E'\n\nThe customer can accept or decline on their job page.'));
  return jsonb_build_object('ok', true, 'new_client_pence', v_client);
end;
$$;

-- ── Customer: accepts the revised price ─────────────────────────────────
create or replace function sq_visit_accept(p_submission_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js    job_submissions%rowtype;
  v_cl    client_quotes%rowtype;
  v_email text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.visit_status is distinct from 'revised' or v_js.status <> 'variation_pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_revised');
  end if;
  select * into v_cl from client_quotes where id = v_js.accepted_client_quote_id;

  -- The new price is a total: whatever rate or unit basis the old one was
  -- quoted on no longer describes it.
  update contractor_quotes
     set contractor_price_pence = v_js.visit_revised_contractor_pence, quote_type = 'total'
   where id = v_cl.contractor_quote_id;
  update client_quotes
     set client_price_pence = v_js.visit_revised_client_pence,
         client_rate_value_pence = null, client_rate_minimum_pence = null,
         unit_label = null, unit_quantity = null
   where id = v_cl.id;

  update job_submissions
     set status = coalesce(visit_prev_status, 'awarded'),
         visit_status = 'confirmed',
         visit_decided_at = now()
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'variation_pending',
    coalesce(v_js.visit_prev_status, 'awarded'), 'client', null,
    'revised price accepted after the site visit',
    jsonb_build_object('old_client_pence', v_cl.client_price_pence,
                       'new_client_pence', v_js.visit_revised_client_pence));

  select email into v_email from contractors where id = v_js.awarded_contractor_id;
  if v_email is not null then
    perform sq_notify_once(v_js.id, v_email || ':visit_accepted', 'sq_visit_accepted', v_email,
      jsonb_build_object('contact_name', v_js.contact_name,
                         'contractor_pence', v_js.visit_revised_contractor_pence));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Customer: declines — recorded after the app has refunded the deposit ─
create or replace function sq_visit_declined(p_submission_id uuid, p_refund_pence int)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js    job_submissions%rowtype;
  v_email text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status = 'cancelled' and v_js.visit_status = 'declined' then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if v_js.visit_status is distinct from 'revised' or v_js.status <> 'variation_pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_revised');
  end if;

  update job_submissions
     set status = 'cancelled', visit_status = 'declined', visit_decided_at = now()
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'variation_pending', 'cancelled', 'client', null,
    'revised price declined after the site visit; deposit refunded in full',
    jsonb_build_object('refund_pence', p_refund_pence));

  update job_payments set status = 'expired', last_error = 'job cancelled'
   where submission_id = v_js.id and kind = 'balance' and status in ('due', 'failed', 'pending');
  update job_payments
     set status = 'refunded', refunded_pence = amount_pence, refunded_at = now()
   where submission_id = v_js.id and kind = 'deposit' and status = 'paid';

  select email into v_email from contractors where id = v_js.awarded_contractor_id;
  if v_email is not null then
    perform sq_notify_once(v_js.id, v_email || ':visit_declined', 'sq_visit_declined', v_email,
      jsonb_build_object('contact_name', v_js.contact_name));
  end if;
  insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
    jsonb_build_object(
      'subject', 'Revised price declined — job cancelled and deposit refunded',
      'text', 'The customer on job ' || v_js.id || ' declined the price revised after the site visit. '
        || 'The job is cancelled and ' || round(p_refund_pence / 100.0, 2)
        || E' GBP was refunded to their card.'));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Hourly: the day-5 reminder, and silence becoming confirmation ───────
create or replace function sq_visit_tick() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_reminded int := 0;
  v_confirmed int := 0;
  v_email text;
begin
  for r in
    select * from job_submissions
     where visit_status = 'awaiting_visit' and visit_reminded_at is null
       and visit_due_at <= now() + interval '2 days' and visit_due_at > now()
     for update skip locked
  loop
    select email into v_email from contractors where id = r.awarded_contractor_id;
    if v_email is not null then
      perform sq_notify_once(r.id, v_email || ':visit_reminder', 'sq_visit_reminder', v_email,
        jsonb_build_object('contact_name', r.contact_name, 'due_at', r.visit_due_at));
    end if;
    update job_submissions set visit_reminded_at = now() where id = r.id;
    v_reminded := v_reminded + 1;
  end loop;

  for r in
    select * from job_submissions
     where visit_status = 'awaiting_visit' and visit_due_at <= now()
     for update skip locked
  loop
    update job_submissions set visit_status = 'confirmed', visit_decided_at = now() where id = r.id;
    perform log_job_event(r.id, 'visit_confirmed', null, null, 'system', null,
      'price confirmed automatically: 7 days after award with no revision', '{}');
    perform sq_notify_once(r.id, coalesce(r.contact_email, 'unknown') || ':visit',
      'sq_visit_confirmed', r.contact_email, jsonb_build_object(
        'client_token', r.client_token,
        'contact_name', r.contact_name,
        'contractor_business_name', (select business_name from contractors where id = r.awarded_contractor_id),
        'auto', true));
    v_confirmed := v_confirmed + 1;
  end loop;

  return jsonb_build_object('reminded', v_reminded, 'confirmed', v_confirmed);
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'site-visit-tick') then
    perform cron.unschedule('site-visit-tick');
  end if;
  perform cron.schedule('site-visit-tick', '37 * * * *', $c$select sq_visit_tick();$c$);
end $$;

-- `revoke … from public` alone is a no-op here: default privileges grant
-- anon and authenticated directly, so they are named.
revoke execute on function sq_visit_on_status()                      from public, anon, authenticated;
revoke execute on function sq_visit_confirm(uuid, uuid)              from public, anon, authenticated;
revoke execute on function sq_visit_revise(uuid, uuid, int, text)    from public, anon, authenticated;
revoke execute on function sq_visit_accept(uuid)                     from public, anon, authenticated;
revoke execute on function sq_visit_declined(uuid, int)              from public, anon, authenticated;
revoke execute on function sq_visit_tick()                           from public, anon, authenticated;
grant  execute on function sq_visit_confirm(uuid, uuid)              to service_role;
grant  execute on function sq_visit_revise(uuid, uuid, int, text)    to service_role;
grant  execute on function sq_visit_accept(uuid)                     to service_role;
grant  execute on function sq_visit_declined(uuid, int)              to service_role;
grant  execute on function sq_visit_tick()                           to service_role;

-- ── /won keeps showing a job while a revised price waits ────────────────
-- Otherwise a contractor who revises the price watches the job vanish from
-- their list, customer's details and all, until the customer answers. The
-- live definition with 'variation_pending' added to the statuses.
create or replace view my_sq_won_jobs as
SELECT js.id,
    COALESCE(s.name, js.service_verbatim, 'Job'::text) AS service,
    js.contact_name,
    js.contact_phone,
    js.contact_email,
    js.contact_preference,
    js.postcode,
    js.lat,
    js.lng,
    js.gate_w3w,
    js.gate_width,
    js.access_notes,
    js.obstacles,
    js.area_value,
    js.area_unit,
    js.area_mapped_value,
    js.boundary,
    js.urgency,
    js.target_date,
    js.service_attributes,
    js.status,
    js.awarded_at,
    c.name AS county,
    cq.contractor_price_pence,
    js.contractor_invoice_name,
    js.contractor_invoice_at,
    cp.amount_pence AS paid_out_pence,
    cp.paid_on AS paid_out_on
   FROM job_submissions js
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
     LEFT JOIN client_quotes clq ON clq.id = js.accepted_client_quote_id
     LEFT JOIN contractor_quotes cq ON cq.id = clq.contractor_quote_id
     LEFT JOIN contractor_payouts cp ON cp.submission_id = js.id
  WHERE js.awarded_contractor_id = auth.uid() AND (js.status = ANY (ARRAY['awarded'::text, 'contacted'::text, 'scheduled'::text, 'in_progress'::text, 'completed_by_contractor'::text, 'completed'::text, 'paid'::text, 'variation_pending'::text]));
