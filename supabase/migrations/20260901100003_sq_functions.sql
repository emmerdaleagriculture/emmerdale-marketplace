-- ============================================================================
-- Sealed-quote funnel: the engine.
--
-- Every race-prone mutation is a security-definer function: acceptance,
-- award and quote submission need row locks + multi-table writes + event
-- logging + email queueing in ONE transaction (§16a.3, §22 "two concurrent
-- acceptances → exactly one award"). App code supplies tokens/Stripe/LLM;
-- authority lives here.
--
-- Every status write is immediately followed by log_job_event in the same
-- transaction — the transition and its event cannot diverge (§22).
--
-- TEST MODE: while app_config.sq_test_contractor_allowlist is a non-empty
-- array, distribution matches ONLY allowlisted contractor emails. Real
-- contractors get neither invitation rows nor emails during testing.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- pgcrypto lives in the `extensions` schema on Supabase — qualify it, since
-- every function here pins search_path to public.
create or replace function sq_token() returns text
language sql volatile as $$
  select encode(extensions.gen_random_bytes(24), 'hex');
$$;

create or replace function haversine_miles(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 3958.8 * 2 * asin(least(1, sqrt(
      power(sin(radians((lat2 - lat1) / 2)), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians((lng2 - lng1) / 2)), 2)
    )))
  end;
$$;

-- Canonical markup: client price = contractor price × (1 + rate), rounded UP
-- to the nearest £5 (500p). Stored at creation, never derived on read (§18).
create or replace function client_price_pence(p_contractor_pence int, p_rate numeric)
returns int language sql immutable as $$
  select (ceil((p_contractor_pence::numeric * (1 + p_rate)) / 500) * 500)::int;
$$;

-- Queue an email exactly once per (submission, recipient, kind).
create or replace function sq_notify_once(
  p_submission_id uuid, p_recipient text, p_kind text, p_to_email text, p_payload jsonb
) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  insert into submission_notifications (submission_id, recipient, kind)
  values (p_submission_id, p_recipient, p_kind)
  on conflict do nothing;
  if found then
    insert into pending_emails (kind, to_email, payload) values (p_kind, p_to_email, p_payload);
    return true;
  end if;
  return false;
end;
$$;

-- Shared payload of job facts safe for contractors pre-award: NO identity,
-- NO contact, district only, no coordinates, no what3words (§14 rule 4).
create or replace function sq_job_facts(p_submission_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'submission_id', js.id,
    'service', s.name,
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
  left join services s on s.id = js.service_id
  left join counties c on c.id = js.county_id
  where js.id = p_submission_id;
$$;

-- ── distribute_submission ───────────────────────────────────────────────────
-- Matching (§15, decided): county AND service, approved AND vetted, no cap,
-- no distance filter. Distance is computed for display only.
create or replace function distribute_submission(p_submission_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js job_submissions%rowtype;
  v_allowlist jsonb;
  v_match record;
  v_invited int := 0;
  v_token text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status <> 'confirmed' then
    return jsonb_build_object('ok', true, 'skipped', true, 'status', v_js.status);
  end if;

  -- An unmatched service has no match key: hold for operator classification
  -- rather than silently losing a real job.
  if v_js.service_id is null then
    perform sq_notify_once(v_js.id, '__admin__', 'sq_unmatched_needs_classification', '__admin__',
      jsonb_build_object('submission_id', v_js.id, 'service_verbatim', v_js.service_verbatim));
    return jsonb_build_object('ok', true, 'held', 'unmatched');
  end if;

  if v_js.client_token is null then
    update job_submissions set client_token = sq_token() where id = v_js.id
      returning client_token into v_js.client_token;
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  for v_match in
    select ct.id, ct.email, ct.base_lat, ct.base_lng
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
     where cc.county_id = v_js.county_id
       and v_js.service_id = any(ct.services)
       and ct.status = 'approved'
       and ct.vetted_at is not null
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
  loop
    v_token := sq_token();
    insert into job_invitations (submission_id, contractor_id, token, distance_miles)
    values (v_js.id, v_match.id, v_token,
            round(haversine_miles(v_js.lat, v_js.lng, v_match.base_lat, v_match.base_lng), 1))
    on conflict (submission_id, contractor_id) do nothing;
    if found then
      v_invited := v_invited + 1;
      insert into invitation_events (invitation_id, contractor_id, event_type)
      select id, contractor_id, 'sent' from job_invitations
       where submission_id = v_js.id and contractor_id = v_match.id;
      perform sq_notify_once(v_js.id, v_match.id::text, 'sq_invitation', v_match.email,
        sq_job_facts(v_js.id) || jsonb_build_object(
          'token', (select token from job_invitations where submission_id = v_js.id and contractor_id = v_match.id),
          'distance_miles', round(haversine_miles(v_js.lat, v_js.lng, v_match.base_lat, v_match.base_lng), 1)));
    end if;
  end loop;

  if v_invited = 0 then
    update job_submissions set status = 'no_matches' where id = v_js.id;
    perform log_job_event(v_js.id, 'status_change', 'confirmed', 'no_matches', 'system', null, null,
      jsonb_build_object('county_id', v_js.county_id, 'service_id', v_js.service_id));
    perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'), 'sq_no_matches',
      v_js.contact_email, sq_job_facts(v_js.id) || jsonb_build_object('contact_name', v_js.contact_name));
    perform sq_notify_once(v_js.id, '__admin__', 'sq_no_matches', '__admin__',
      sq_job_facts(v_js.id) || jsonb_build_object('supply_gap', true));
    return jsonb_build_object('ok', true, 'invited', 0, 'status', 'no_matches');
  end if;

  update job_submissions
     set status = 'distributed',
         distributed_at = now(),
         expires_at = now() + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int)
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'confirmed', 'distributed', 'system', null, null,
    jsonb_build_object('invited_count', v_invited));

  -- The client's key to their job page — sent once, at distribution.
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_portal_link',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token, 'contact_name', v_js.contact_name));

  return jsonb_build_object('ok', true, 'invited', v_invited);
end;
$$;

-- ── record_invitation_view ──────────────────────────────────────────────────
create or replace function record_invitation_view(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_inv job_invitations%rowtype;
begin
  select * into v_inv from job_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_inv.opened_at is null then
    update job_invitations
       set opened_at = now(), status = case when status = 'sent' then 'viewed' else status end
     where id = v_inv.id;
    insert into invitation_events (invitation_id, contractor_id, event_type)
    values (v_inv.id, v_inv.contractor_id, 'viewed');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── decline_invitation ──────────────────────────────────────────────────────
create or replace function decline_invitation(p_token text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_inv job_invitations%rowtype;
begin
  if p_reason not in ('too_far','too_busy','wrong_service','not_interested') then
    return jsonb_build_object('ok', false, 'reason', 'bad_reason');
  end if;
  select * into v_inv from job_invitations where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_inv.status = 'declined' then return jsonb_build_object('ok', true, 'idempotent', true); end if;
  if v_inv.status = 'priced' then return jsonb_build_object('ok', false, 'reason', 'already_priced'); end if;
  if v_inv.status in ('closed_awarded','closed_stale') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  update job_invitations set status = 'declined', decline_reason = p_reason where id = v_inv.id;
  insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
  values (v_inv.id, v_inv.contractor_id, 'declined', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── sq_publish_quote (internal) ─────────────────────────────────────────────
-- Creates/updates the client-facing quote row for a confirmed contractor
-- quote, allocates the stable masked label, and drives the first-quote
-- transition + client notification. Callers hold the submission lock.
create or replace function sq_publish_quote(p_quote_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
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
      'service', (select name from services where id = v_js.service_id),
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate),
      'contractor_label', v_label,
      'contact_name', v_js.contact_name));
  end if;
end;
$$;

-- ── submit_contractor_quote ─────────────────────────────────────────────────
-- THE single quote write path (§19): tokenised form, portal revisions, and
-- confirmed email replies all land here.
create or replace function submit_contractor_quote(
  p_token text,
  p_quote_type text,
  p_price_pence int,
  p_rate_value_pence int,
  p_rate_minimum_pence int,
  p_site_visit boolean,
  p_notes text,
  p_valid_until date,
  p_source text,
  p_confirmed boolean
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv job_invitations%rowtype;
  v_js job_submissions%rowtype;
  v_prior contractor_quotes%rowtype;
  v_acres numeric;
  v_price int;
  v_new_id uuid;
  v_confirm_token text;
begin
  select * into v_inv from job_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_js from job_submissions where id = v_inv.submission_id for update;

  -- Other contractors may still price during the payment window (§27).
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

  -- Shorter validity allowed, longer than the job is not (§16a.5).
  if p_valid_until is not null and v_js.expires_at is not null
     and p_valid_until > v_js.expires_at::date then
    p_valid_until := v_js.expires_at::date;
  end if;

  select * into v_prior from contractor_quotes
   where submission_id = v_js.id and contractor_id = v_inv.contractor_id
     and superseded_by is null
   order by created_at desc limit 1;

  if p_confirmed = false then v_confirm_token := sq_token(); end if;

  -- The one-live-quote unique index would reject the new row while the prior
  -- is still live: park the prior on a self-reference first (drops it out of
  -- the partial index), then repoint it at the real successor below.
  if v_prior.id is not null then
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

  if v_prior.id is not null then
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

  -- Email-parsed figure: never live without the one-click confirm (§17).
  insert into pending_emails (kind, to_email, payload)
  select 'sq_quote_confirm', ct.email, jsonb_build_object(
    'confirm_token', v_confirm_token,
    'amount_pence', v_price,
    'service', (select name from services where id = v_js.service_id),
    'postcode_district', split_part(v_js.postcode, ' ', 1))
  from contractors ct where ct.id = v_inv.contractor_id;
  return jsonb_build_object('ok', true, 'quote_id', v_new_id, 'pending_confirm', true);
end;
$$;

-- ── confirm_email_quote ─────────────────────────────────────────────────────
create or replace function confirm_email_quote(p_confirm_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cq contractor_quotes%rowtype;
  v_js job_submissions%rowtype;
begin
  select * into v_cq from contractor_quotes where confirm_token = p_confirm_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_cq.confirmed_by_contractor then return jsonb_build_object('ok', true, 'idempotent', true); end if;
  select * into v_js from job_submissions where id = v_cq.submission_id for update;
  if v_js.status not in ('distributed','quotes_receiving','accepted_awaiting_payment') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  -- A newer quote may exist (contractor used the form meanwhile): confirming
  -- a superseded parse must not resurrect it.
  if v_cq.superseded_by is not null then
    return jsonb_build_object('ok', false, 'reason', 'superseded');
  end if;
  update contractor_quotes
     set confirmed_by_contractor = true, confirm_token = null
   where id = v_cq.id;
  insert into invitation_events (invitation_id, contractor_id, event_type)
  values (v_cq.invitation_id, v_cq.contractor_id, 'confirmed');
  perform sq_publish_quote(v_cq.id);
  return jsonb_build_object('ok', true, 'amount_pence', v_cq.contractor_price_pence);
end;
$$;

-- ── begin_acceptance ────────────────────────────────────────────────────────
create or replace function begin_acceptance(
  p_client_token text,
  p_client_quote_id uuid,
  p_session_id text,
  p_session_expires_at timestamptz,
  p_checkout_url text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js job_submissions%rowtype;
  v_q client_quotes%rowtype;
begin
  select * into v_js from job_submissions
   where client_token = p_client_token and client_token_revoked_at is null
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status <> 'quotes_receiving' then
    return jsonb_build_object('ok', false, 'reason', 'conflict', 'status', v_js.status);
  end if;
  select * into v_q from client_quotes where id = p_client_quote_id;
  if not found or v_q.submission_id <> v_js.id or v_q.status <> 'active'
     or v_q.valid_until < current_date then
    return jsonb_build_object('ok', false, 'reason', 'quote_unavailable');
  end if;

  update job_submissions
     set status = 'accepted_awaiting_payment', accepted_client_quote_id = v_q.id
   where id = v_js.id;
  update client_quotes set status = 'accepted' where id = v_q.id;
  insert into job_payments (submission_id, client_quote_id, stripe_checkout_session_id,
                            amount_pence, expires_at)
  values (v_js.id, v_q.id, p_session_id, v_q.client_price_pence, p_session_expires_at);

  perform log_job_event(v_js.id, 'status_change', 'quotes_receiving', 'accepted_awaiting_payment',
    'client', null, null, jsonb_build_object('client_quote_id', v_q.id));
  perform log_job_event(v_js.id, 'payment_link_issued', null, null, 'system', null, null,
    jsonb_build_object('session_id', p_session_id, 'amount_pence', v_q.client_price_pence));

  insert into pending_emails (kind, to_email, payload)
  values ('sq_payment_link', v_js.contact_email, jsonb_build_object(
    'client_token', v_js.client_token,
    'checkout_url', p_checkout_url,
    'amount_pence', v_q.client_price_pence,
    'expires_at', p_session_expires_at,
    'contractor_label', v_q.contractor_display_label,
    'contact_name', v_js.contact_name));

  return jsonb_build_object('ok', true);
end;
$$;

-- ── award_submission ────────────────────────────────────────────────────────
-- Triggered by PAYMENT CLEARING (v1.6 §27), never by acceptance. The
-- contractor learns of the award only here.
create or replace function award_submission(p_session_id text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
  update job_payments set status = 'paid', paid_at = now() where id = v_pay.id;
  select * into v_q from client_quotes where id = v_pay.client_quote_id;

  if v_js.status = 'accepted_awaiting_payment' and v_js.accepted_client_quote_id = v_pay.client_quote_id then
    null; -- happy path
  elsif v_js.status = 'quotes_receiving' and v_q.status in ('active','accepted') then
    -- Late payment after a void: cleanly re-accept and proceed.
    update job_submissions set accepted_client_quote_id = v_q.id where id = v_js.id;
    update client_quotes set status = 'accepted' where id = v_q.id;
  else
    -- Money into a closed job: never auto-refund (§28) — operator decides.
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

  -- Identity revealed to the client on award only (§18).
  update client_quotes set contractor_real_name = v_ct.business_name, status = 'accepted'
   where id = v_q.id;

  -- Close everything else.
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
      jsonb_build_object('service', (select name from services where id = v_js.service_id),
                         'postcode_district', split_part(v_js.postcode, ' ', 1)));
  end loop;
  update client_quotes set status = 'closed'
   where submission_id = v_js.id and id <> v_q.id and status in ('active','superseded');

  -- Contact release, audited (§14 rule 4 / §22).
  perform log_job_event(v_js.id, 'contact_released', null, null, 'system', null, null,
    jsonb_build_object('contractor_id', v_q.contractor_id,
                       'fields', jsonb_build_array('name','phone','email','postcode','w3w')));

  perform sq_notify_once(v_js.id, v_q.contractor_id::text, 'sq_award_won', v_ct.email,
    jsonb_build_object(
      'submission_id', v_js.id,
      'service', (select name from services where id = v_js.service_id),
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
$$;

-- ── void_acceptance ─────────────────────────────────────────────────────────
-- Payment-link lapse (§27): acceptance is void, quote returns to the list,
-- no contractor is told anything. Retry = re-accept, one tap.
create or replace function void_acceptance(p_session_id text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pay job_payments%rowtype;
  v_js job_submissions%rowtype;
begin
  select * into v_pay from job_payments where stripe_checkout_session_id = p_session_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_session'); end if;
  if v_pay.status <> 'pending' then return jsonb_build_object('ok', true, 'idempotent', true); end if;

  select * into v_js from job_submissions where id = v_pay.submission_id for update;
  update job_payments set status = 'expired' where id = v_pay.id;

  if v_js.status = 'accepted_awaiting_payment'
     and v_js.accepted_client_quote_id = v_pay.client_quote_id then
    update job_submissions
       set status = 'quotes_receiving', accepted_client_quote_id = null
     where id = v_js.id;
    update client_quotes set status = 'active' where id = v_pay.client_quote_id;
    perform log_job_event(v_js.id, 'payment_link_expired', 'accepted_awaiting_payment',
      'quotes_receiving', 'system', null, null,
      jsonb_build_object('session_id', p_session_id));
    insert into pending_emails (kind, to_email, payload)
    values ('sq_payment_expired', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contractor_label', (select contractor_display_label from client_quotes where id = v_pay.client_quote_id),
      'contact_name', v_js.contact_name));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── submit_client_rating ────────────────────────────────────────────────────
create or replace function submit_client_rating(p_client_token text, p_stars int, p_comment text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_js job_submissions%rowtype;
begin
  if p_stars is null or p_stars not between 1 and 5 then
    return jsonb_build_object('ok', false, 'reason', 'bad_stars');
  end if;
  select * into v_js from job_submissions
   where client_token = p_client_token and client_token_revoked_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status not in ('completed','paid') then
    return jsonb_build_object('ok', false, 'reason', 'not_completed');
  end if;
  if v_js.awarded_contractor_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_contractor');
  end if;
  insert into contractor_ratings (submission_id, contractor_id, stars, comment)
  values (v_js.id, v_js.awarded_contractor_id, p_stars, nullif(trim(coalesce(p_comment,'')), ''))
  on conflict (submission_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_rated'); end if;
  update contractors ct
     set rating_avg = (select avg(stars) from contractor_ratings where contractor_id = ct.id),
         rating_count = (select count(*) from contractor_ratings where contractor_id = ct.id)
   where ct.id = v_js.awarded_contractor_id;
  perform log_job_event(v_js.id, 'rating_received', null, null, 'client', null, null,
    jsonb_build_object('stars', p_stars));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── mark_submission_completed ───────────────────────────────────────────────
-- Part 2 "basic completion": operator-marked; the contractor/client
-- confirmation chain is Part 3, and the rating plumbing won't change.
create or replace function mark_submission_completed(
  p_submission_id uuid, p_operator_id uuid, p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_js job_submissions%rowtype;
begin
  if p_reason is null or trim(p_reason) = '' then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status not in ('awarded','contacted','scheduled','in_progress','completed_by_contractor') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status', 'status', v_js.status);
  end if;
  update job_submissions set status = 'completed' where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'completed', 'operator',
    p_operator_id, p_reason, '{}');
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_rating_request',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contractor_business_name',
        (select business_name from contractors where id = v_js.awarded_contractor_id),
      'contact_name', v_js.contact_name));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── sealed_quote_tick ───────────────────────────────────────────────────────
create or replace function sealed_quote_tick() returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_batch_hours numeric;
begin
  -- 1) Distribution backstop: a crashed confirm action must not strand a job
  --    (§30 flags undistributed at 15 min; this catches it at 5).
  for r in
    select id from job_submissions
     where status = 'confirmed' and service_id is not null
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
          'service', (select name from services where id = r.service_id),
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
        'service', (select name from services where id = r.service_id),
        'county', (select name from counties where id = r.county_id)));
    perform sq_notify_once(r.id, '__admin__', 'sq_no_quotes_yet', '__admin__',
      jsonb_build_object('submission_id', r.id,
        'county', (select name from counties where id = r.county_id)));
  end loop;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
do $g$
declare fn text;
begin
  foreach fn in array array[
    'sq_token()',
    'sq_notify_once(uuid,text,text,text,jsonb)',
    'sq_job_facts(uuid)',
    'distribute_submission(uuid)',
    'record_invitation_view(text)',
    'decline_invitation(text,text)',
    'sq_publish_quote(uuid)',
    'submit_contractor_quote(text,text,int,int,int,boolean,text,date,text,boolean)',
    'confirm_email_quote(text)',
    'begin_acceptance(text,uuid,text,timestamptz,text)',
    'award_submission(text)',
    'void_acceptance(text)',
    'submit_client_rating(text,int,text)',
    'mark_submission_completed(uuid,uuid,text)',
    'sealed_quote_tick()'
  ]
  loop
    execute format('revoke execute on function %s from public', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$g$;
