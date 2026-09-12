-- ============================================================================
-- "Email me when a new job is posted" now means it for invitations.
--
-- contractors.notify_new_jobs sits on the contractor's settings page, but only
-- the retired open-access board read it: distribute_submission and the late
-- invite sent every invitation email regardless, so unticking the box changed
-- nothing a contractor could see.
--
-- Opting out now stops the invitation *email* only. The invitation row is
-- still created, so the job is on their dashboard and /invitations to price
-- whenever they look — they have chosen how to hear about work, not whether
-- to get it. (All 81 contractors have it on today; nobody's mail changes.)
--
-- Both bodies are otherwise identical to their current definitions, from
-- 20260904180000 and 20260912170000 respectively.
-- ============================================================================

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

  if v_js.client_token is null then
    update job_submissions set client_token = sq_token() where id = v_js.id
      returning client_token into v_js.client_token;
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  for v_match in
    select ct.id, ct.email, ct.base_lat, ct.base_lng, ct.notify_new_jobs
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
     where cc.county_id = v_js.county_id
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
      if v_match.notify_new_jobs then
        perform sq_notify_once(v_js.id, v_match.id::text, 'sq_invitation', v_match.email,
          sq_job_facts(v_js.id) || jsonb_build_object(
            'token', (select token from job_invitations where submission_id = v_js.id and contractor_id = v_match.id),
            'distance_miles', round(haversine_miles(v_js.lat, v_js.lng, v_match.base_lat, v_match.base_lng), 1)));
      end if;
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

  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_portal_link',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token, 'contact_name', v_js.contact_name));

  return jsonb_build_object('ok', true, 'invited', v_invited);
end;
$$;

create or replace function invite_contractor_to_open_jobs(
  p_contractor_id uuid, p_county_id int default null
) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_ct contractors%rowtype;
  v_allowlist jsonb;
  v_js record;
  v_inv job_invitations%rowtype;
  v_invited int := 0;
begin
  select * into v_ct from contractors where id = p_contractor_id;
  if not found or v_ct.status <> 'approved' or v_ct.vetted_at is null then
    return 0;
  end if;

  -- Test mode: same filter as distribute_submission.
  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);
  if jsonb_array_length(v_allowlist) > 0
     and v_ct.email not in (select jsonb_array_elements_text(v_allowlist)) then
    return 0;
  end if;

  for v_js in
    select js.id, js.lat, js.lng
      from job_submissions js
      join contractor_counties cc
        on cc.county_id = js.county_id and cc.contractor_id = v_ct.id
     where js.status in ('distributed', 'quotes_receiving')
       and js.expires_at > now() + make_interval(hours => app_config_num('sq_late_invite_min_hours', 12)::int)
       and (p_county_id is null or js.county_id = p_county_id)
     order by js.expires_at
       for share of js skip locked
  loop
    insert into job_invitations (submission_id, contractor_id, token, distance_miles)
    values (v_js.id, v_ct.id, sq_token(),
            round(haversine_miles(v_js.lat, v_js.lng, v_ct.base_lat, v_ct.base_lng), 1))
    on conflict (submission_id, contractor_id) do nothing
    returning * into v_inv;
    if found then
      v_invited := v_invited + 1;
      insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
      values (v_inv.id, v_ct.id, 'sent', jsonb_build_object('late_join', true));
      if v_ct.notify_new_jobs then
        perform sq_notify_once(v_js.id, v_ct.id::text, 'sq_invitation', v_ct.email,
          sq_job_facts(v_js.id) || jsonb_build_object(
            'token', v_inv.token,
            'distance_miles', v_inv.distance_miles,
            'late_join', true));
      end if;
    end if;
  end loop;

  return v_invited;
end;
$$;

revoke execute on function invite_contractor_to_open_jobs(uuid, int) from public;
grant execute on function invite_contractor_to_open_jobs(uuid, int) to service_role;
