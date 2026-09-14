-- ============================================================================
-- First refusal: new jobs in one contractor's counties go to them alone first.
--
-- Hampshire Paddock Management gets first go at every new job in a county it
-- covers. It is offered to them alone for sq_first_refusal_window_hours (24).
-- If they pass, or the window closes without their price, the job opens to
-- every other contractor covering the county. If they price it, they keep it
-- — the market never opens, exactly as a direct repeat behaves.
--
-- Built on the repeat direct-offer machinery (20260912220000): the job carries
-- preferred_contractor_id + market_opens_at, and sq_direct_window_tick opens
-- it. What differs is what people are told, so the job is marked
-- first_refusal:
--
--   customer     nothing different. No contractor named in the portal email,
--                no "going out to more contractors" email when it opens, and
--                the job page reads as an ordinary job.
--   contractor   "offered to you first", not "the customer asked for you again".
--
-- Repeats are left alone: a customer who asked for their previous contractor
-- gets them, and one who chose to test the market gets the market.
--
-- Off switch: set sq_first_refusal_contractor_id to "" in app_config. A
-- contractor who is not approved + vetted (or not allowlisted in test mode) is
-- skipped and the job goes straight to the market.
-- ============================================================================

alter table job_submissions
  add column if not exists first_refusal boolean not null default false;

insert into app_config (key, value) values
  ('sq_first_refusal_contractor_id', '"34d6e50f-cc78-4bf4-9021-9f5bfd1840fa"'),
  ('sq_first_refusal_window_hours', '24')
on conflict (key) do nothing;

-- ── Distribution ────────────────────────────────────────────────────────────
create or replace function distribute_submission(p_submission_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js         job_submissions%rowtype;
  v_allowlist  jsonb;
  v_match      record;
  v_invited    int := 0;
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
      select ct.id
        from contractors ct
        join contractor_counties cc on cc.contractor_id = ct.id
       where cc.county_id = v_js.county_id
         and ct.status = 'approved'
         and ct.vetted_at is not null
         and (jsonb_array_length(v_allowlist) = 0
              or ct.email in (select jsonb_array_elements_text(v_allowlist)))
    loop
      if sq_invite_contractor(v_js.id, v_match.id) then
        v_invited := v_invited + 1;
      end if;
    end loop;
  end if;

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
         expires_at = now() + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int),
         market_opens_at = v_opens
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'confirmed', 'distributed', 'system', null, null,
    jsonb_build_object('invited_count', v_invited, 'direct_contractor_id', v_direct.id,
                       'direct_unavailable', v_unavailable, 'first_refusal', v_first));

  -- A first-refusal job reads to the customer as an ordinary one: no name.
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_portal_link',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
      'direct_contractor', case when v_first then null else v_direct.business_name end,
      'market_opens_at', case when v_first then null else v_opens end,
      'direct_unavailable', v_unavailable));

  return jsonb_build_object('ok', true, 'invited', v_invited,
                            'direct', v_direct.id is not null, 'first_refusal', v_first);
end;
$$;

-- ── Opening a job to the market ─────────────────────────────────────────────
-- Unchanged except that a first-refusal job opens silently: the customer was
-- never told it went to one contractor, so "going out to more contractors"
-- would be news about something they didn't know happened.
create or replace function open_submission_to_market(
  p_submission_id uuid, p_reason text default 'customer'
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js        job_submissions%rowtype;
  v_allowlist jsonb;
  v_match     record;
  v_invited   int := 0;
  v_name      text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.market_opens_at is null then return jsonb_build_object('ok', false, 'reason', 'not_direct'); end if;
  if v_js.status not in ('distributed', 'quotes_receiving') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  for v_match in
    select ct.id
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
     where cc.county_id = v_js.county_id
       and ct.status = 'approved'
       and ct.vetted_at is not null
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
  loop
    if sq_invite_contractor(v_js.id, v_match.id, jsonb_build_object('opened_to_market', p_reason)) then
      v_invited := v_invited + 1;
    end if;
  end loop;

  update job_submissions
     set market_opens_at = null,
         distributed_at = now(),
         expires_at = greatest(expires_at,
           now() + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int))
   where id = v_js.id;

  if p_reason in ('declined', 'timeout') and not v_js.first_refusal then
    select business_name into v_name from contractors where id = v_js.preferred_contractor_id;
    perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'), 'sq_direct_fallback',
      v_js.contact_email, jsonb_build_object(
        'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
        'contractor_name', v_name, 'reason', p_reason, 'invited', v_invited));
  end if;

  return jsonb_build_object('ok', true, 'invited', v_invited);
end;
$$;

revoke execute on function open_submission_to_market(uuid, text) from public, anon, authenticated;
grant execute on function open_submission_to_market(uuid, text) to service_role;

-- ── Publishing a price ──────────────────────────────────────────────────────
-- Unchanged except for one payload flag: the first-price email says "more may
-- follow", which is not true while a first-refusal contractor holds the job
-- they have just priced — it only opens if they pass or run out of time.
create or replace function sq_publish_quote(p_quote_id uuid) returns void
language plpgsql security definer set search_path = public as $$
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
      'contact_name', v_js.contact_name,
      'sole_offer', v_js.first_refusal and v_js.market_opens_at is not null
                    and v_js.preferred_contractor_id = v_cq.contractor_id));
  end if;
end;
$$;

-- ── Contractor invitations list ─────────────────────────────────────────────
-- offered_until: when this contractor holds the job alone (first refusal or a
-- direct repeat), the moment it opens to others — the deadline that matters,
-- rather than the 7-day expiry shown on every other card. Appended last:
-- create or replace view can only add columns at the end.
create or replace view my_sq_invitations as
 SELECT i.id,
    i.token,
    i.status,
    i.decline_reason,
    i.distance_miles,
    i.sent_at,
    i.opened_at,
    js.id AS submission_id,
    COALESCE(s.name, js.service_verbatim, 'Job'::text) AS service,
    split_part(js.postcode, ' '::text, 1) AS postcode_district,
    c.name AS county,
    js.area_value,
    js.area_unit,
    js.area_mapped_value,
    js.area_source,
    js.boundary,
    js.urgency,
    js.target_date,
    js.access_notes,
    js.obstacles,
    js.gate_width,
    js.service_attributes,
    js.expires_at,
        CASE
            WHEN js.status = ANY (ARRAY['distributed'::text, 'quotes_receiving'::text, 'accepted_awaiting_payment'::text]) THEN 'open'::text
            ELSE 'closed'::text
        END AS job_state,
        CASE
            WHEN js.preferred_contractor_id = i.contractor_id THEN js.market_opens_at
        END AS offered_until
   FROM job_invitations i
     JOIN job_submissions js ON js.id = i.submission_id
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
  WHERE i.contractor_id = auth.uid();
