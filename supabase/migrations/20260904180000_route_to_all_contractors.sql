-- ============================================================================
-- Stop routing on the classified service.
--
-- Distribution matched contractors on county AND service, and a submission the
-- parser couldn't classify was held back for an operator to classify by hand.
-- Both go: a job now reaches every approved, vetted contractor covering the
-- county, and they read the customer's own words to decide whether it's theirs.
--
-- service_id is still recorded when it is known — it drives the quote form's
-- rate-vs-fixed choice (services.area_priced) and reads better in email — but
-- it no longer decides who sees a job, and a null no longer stalls one.
--
-- Only the two service conditions change; the body is otherwise identical to
-- 20260901100003.
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

  -- (The unmatched-service hold was here. A job with no classification is now
  --  distributed like any other; contractors judge it from the description.)

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

  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_portal_link',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token, 'contact_name', v_js.contact_name));

  return jsonb_build_object('ok', true, 'invited', v_invited);
end;
$$;

-- The 5-minute distribution backstop inside sealed_quote_tick carried the same
-- service filter, so an unclassified job would have sat in `confirmed` forever
-- once the hold above was removed. Reproduced verbatim from the live
-- definition with that one condition dropped.
create or replace function sealed_quote_tick() returns void
language plpgsql volatile security definer set search_path = public as $tick$
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

$tick$;

revoke execute on function sealed_quote_tick() from public;
grant execute on function sealed_quote_tick() to service_role;
