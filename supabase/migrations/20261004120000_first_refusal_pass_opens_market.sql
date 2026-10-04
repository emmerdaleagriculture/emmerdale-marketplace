-- ============================================================================
-- First refusal: a passed price opens the job at once.
--
-- A first-refusal job (HPM first, 20260914120000) went to other contractors
-- only when the offer lapsed, was declined, or sat unaccepted for
-- sq_first_refusal_accept_hours (48h, 20260918140000). A customer who passed
-- on the first-refusal contractor's price — "too expensive", "too far" — was
-- still left with that one price until the 48 hours ran out. That pass is the
-- clearest signal there is that they want other prices, so it now opens the
-- job straight away, through the same route as 'unaccepted': premium members
-- in range first if there are any, otherwise every contractor covering the
-- county.
--
-- Only the preferred contractor's price triggers it, and only on a
-- first-refusal job. Repeat direct offers are untouched: those customers asked
-- for their previous contractor and already have a button to get other prices.
-- The customer is told nothing new; more prices simply appear.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.open_submission_to_market(p_submission_id uuid, p_reason text DEFAULT 'customer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js        job_submissions%rowtype;
  v_allowlist jsonb;
  v_match     record;
  v_invited   int := 0;
  v_too_far   int := 0;
  v_name      text;
  v_premium   int;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.market_opens_at is null then return jsonb_build_object('ok', false, 'reason', 'not_direct'); end if;
  if v_js.status not in ('distributed', 'quotes_receiving') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- HPM first, then premium, then everyone: a first-refusal offer that
  -- lapses, is declined, sits unaccepted or has its price passed goes to premium members before the
  -- market. Once only — the premium window's own ending opens the market.
  if v_js.first_refusal and not v_js.premium_window
     and p_reason in ('declined', 'timeout', 'unaccepted', 'passed') then
    v_premium := sq_start_premium_window(v_js.id);
    if v_premium > 0 then
      return jsonb_build_object('ok', true, 'premium_window', true, 'invited', v_premium);
    end if;
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  for v_match in
    select ct.id,
           sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles) as near
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
     where cc.county_id = v_js.county_id
       and ct.status = 'approved'
       and ct.vetted_at is not null
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
  loop
    if not v_match.near then
      v_too_far := v_too_far + 1;
    elsif sq_invite_contractor(v_js.id, v_match.id, jsonb_build_object('opened_to_market', p_reason)) then
      v_invited := v_invited + 1;
    end if;
  end loop;

  update job_submissions
     set market_opens_at = null,
         distributed_at = now(),
         expires_at = greatest(expires_at,
           now() + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int))
   where id = v_js.id;

  perform log_job_event(v_js.id, 'market_opened', null, null, 'system', null, null,
    jsonb_build_object('reason', p_reason, 'invited_count', v_invited, 'too_far', v_too_far));

  -- Nobody to price it. The job stays open (the direct contractor's own
  -- invitation may still be live) but it is now an admin's problem, said so.
  if v_invited = 0 then
    perform sq_notify_once(v_js.id, '__admin__', 'sq_no_matches', '__admin__',
      sq_job_facts(v_js.id) || jsonb_build_object('supply_gap', true, 'too_far', v_too_far,
                                                  'market_opened', true));
  end if;

  if p_reason in ('declined', 'timeout') and not v_js.first_refusal then
    select business_name into v_name from contractors where id = v_js.preferred_contractor_id;
    perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'), 'sq_direct_fallback',
      v_js.contact_email, jsonb_build_object(
        'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
        'contractor_name', v_name, 'reason', p_reason, 'invited', v_invited));
  end if;

  return jsonb_build_object('ok', true, 'invited', v_invited, 'too_far', v_too_far);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.sq_pass_price(p_submission_id uuid, p_client_quote_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q   client_quotes%rowtype;
  v_js  job_submissions%rowtype;
  v_inv job_invitations%rowtype;
  v_ct  contractors%rowtype;
begin
  if p_reason not in ('too_expensive', 'too_far', 'visit_first', 'terms', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'bad_reason');
  end if;
  select * into v_q from client_quotes where id = p_client_quote_id and submission_id = p_submission_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_q.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'not_active'); end if;
  select * into v_js from job_submissions where id = p_submission_id;
  if v_js.status not in ('quotes_receiving', 'accepted_awaiting_payment') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  insert into client_quote_passes (client_quote_id, submission_id, contractor_id, reason)
  values (v_q.id, v_q.submission_id, v_q.contractor_id, p_reason)
  on conflict (client_quote_id) do update set reason = excluded.reason, created_at = now(), undone_at = null;

  perform log_job_event(v_js.id, 'price_passed', null, null, 'client', null,
    'passed on a price: ' || p_reason,
    jsonb_build_object('client_quote_id', v_q.id, 'contractor_id', v_q.contractor_id,
                       'client_price_pence', v_q.client_price_pence, 'reason', p_reason));

  -- Told once per price, with the category and the way back in.
  select * into v_inv from job_invitations where submission_id = v_js.id and contractor_id = v_q.contractor_id;
  select * into v_ct from contractors where id = v_q.contractor_id;
  if v_ct.email is not null and v_inv.token is not null then
    perform sq_notify_once(v_js.id, v_q.contractor_id::text || ':passed:' || v_q.id,
      'sq_price_passed', v_ct.email, jsonb_build_object(
        'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
        'postcode_district', split_part(v_js.postcode, ' ', 1),
        'reason', p_reason,
        'token', v_inv.token));
  end if;

  -- Passing on the first-refusal contractor's price means the customer wants
  -- other prices: open the job now rather than waiting out the accept window.
  if v_js.first_refusal and not v_js.premium_window
     and v_js.market_opens_at is not null
     and v_js.status = 'quotes_receiving'
     and v_q.contractor_id = v_js.preferred_contractor_id then
    perform open_submission_to_market(v_js.id, 'passed');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$
;
