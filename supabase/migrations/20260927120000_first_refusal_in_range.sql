-- First refusal respects the invite radius (sq_invite_radius_miles).
--
-- HPM's first-refusal area is its seven counties, but those counties reach
-- 82 miles from its base. On 26 Sep an East Sussex job 82 miles away was
-- offered to HPM first, declined as too far within a minute, and only then
-- opened to the market. A job outside the radius now skips the first-refusal
-- offer and goes straight to the market, where HPM is also out of range.
-- Null coordinates on either side still count as in range, as elsewhere.

CREATE OR REPLACE FUNCTION public.distribute_submission(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js         job_submissions%rowtype;
  v_allowlist  jsonb;
  v_match      record;
  v_invited    int := 0;
  v_too_far    int := 0;
  v_direct     contractors%rowtype;
  v_opens      timestamptz;
  v_last_price int;
  v_last_at    timestamptz;
  v_unavailable boolean := false;
  v_fr_id      text;
  v_first      boolean := false;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status <> 'confirmed' then
    return jsonb_build_object('ok', true, 'skipped', true, 'status', v_js.status);
  end if;

  if v_js.client_token is null then
    update job_submissions set client_token = sq_token() where id = v_js.id
      returning client_token into v_js.client_token;
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  -- Same contractor: offered to them alone, if they are still someone we send
  -- work to. County coverage is not re-checked — they did this job before.
  if v_js.preferred_contractor_id is not null then
    select ct.* into v_direct
      from contractors ct
     where ct.id = v_js.preferred_contractor_id
       and ct.status = 'approved'
       and ct.vetted_at is not null
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)));

    if v_direct.id is null then
      v_unavailable := true;
      update job_submissions set preferred_contractor_id = null where id = v_js.id;
    else
      v_opens := now() + make_interval(hours => app_config_num('sq_direct_window_hours', 48)::int);
      select cq.contractor_price_pence, prev.awarded_at
        into v_last_price, v_last_at
        from job_submissions prev
        join client_quotes clq    on clq.id = prev.accepted_client_quote_id
        join contractor_quotes cq on cq.id = clq.contractor_quote_id
       where prev.id = v_js.repeat_of
         and prev.awarded_contractor_id = v_direct.id;
      perform sq_invite_contractor(v_js.id, v_direct.id, jsonb_build_object(
        'direct', true,
        'market_opens_at', v_opens,
        'last_price_pence', v_last_price,
        'last_job_at', v_last_at));
      v_invited := 1;
    end if;

  -- First refusal: a new (non-repeat) job in the contractor's counties.
  elsif v_js.repeat_of is null then
    v_fr_id := (select value #>> '{}' from app_config where key = 'sq_first_refusal_contractor_id');
    if v_fr_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select ct.* into v_direct
        from contractors ct
        join contractor_counties cc
          on cc.contractor_id = ct.id and cc.county_id = v_js.county_id
       where ct.id = v_fr_id::uuid
         -- Only within the invite radius: HPM's counties reach 80+ miles from
         -- its base, and an out-of-range offer is a decline plus a lost day.
         and sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng)
         and ct.status = 'approved'
         and ct.vetted_at is not null
         and (jsonb_array_length(v_allowlist) = 0
              or ct.email in (select jsonb_array_elements_text(v_allowlist)));

      if v_direct.id is not null then
        v_first := true;
        v_opens := now() + make_interval(hours => app_config_num('sq_first_refusal_window_hours', 24)::int);
        update job_submissions
           set preferred_contractor_id = v_direct.id, first_refusal = true
         where id = v_js.id;
        perform sq_invite_contractor(v_js.id, v_direct.id, jsonb_build_object(
          'direct', true,
          'first_refusal', true,
          'market_opens_at', v_opens));
        v_invited := 1;
      end if;
    end if;
  end if;

  if v_direct.id is null then
    for v_match in
      select ct.id,
             sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng) as near
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
      elsif sq_invite_contractor(v_js.id, v_match.id) then
        v_invited := v_invited + 1;
      end if;
    end loop;
  end if;

  if v_invited = 0 then
    update job_submissions set status = 'no_matches' where id = v_js.id;
    perform log_job_event(v_js.id, 'status_change', 'confirmed', 'no_matches', 'system', null, null,
      jsonb_build_object('county_id', v_js.county_id, 'service_id', v_js.service_id,
                         'too_far', v_too_far));
    perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'), 'sq_no_matches',
      v_js.contact_email, sq_job_facts(v_js.id) || jsonb_build_object('contact_name', v_js.contact_name));
    perform sq_notify_once(v_js.id, '__admin__', 'sq_no_matches', '__admin__',
      sq_job_facts(v_js.id) || jsonb_build_object('supply_gap', true, 'too_far', v_too_far));
    return jsonb_build_object('ok', true, 'invited', 0, 'status', 'no_matches', 'too_far', v_too_far);
  end if;

  update job_submissions
     set status = 'distributed',
         distributed_at = now(),
         expires_at = now() + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int),
         market_opens_at = v_opens
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'confirmed', 'distributed', 'system', null, null,
    jsonb_build_object('invited_count', v_invited, 'direct_contractor_id', v_direct.id,
                       'direct_unavailable', v_unavailable, 'first_refusal', v_first,
                       'too_far', v_too_far));

  -- A first-refusal job reads to the customer as an ordinary one: no name.
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_portal_link',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
      'direct_contractor', case when v_first then null else v_direct.business_name end,
      'market_opens_at', case when v_first then null else v_opens end,
      'direct_unavailable', v_unavailable));

  return jsonb_build_object('ok', true, 'invited', v_invited, 'too_far', v_too_far,
                            'direct', v_direct.id is not null, 'first_refusal', v_first);
end;
$function$;
