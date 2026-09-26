-- Review fixes for 20260926180000 (PR #136), before it has been live a day.
--
-- 1. The reminder said "the job we sent you yesterday" to invitations up to
--    three days old. The payload now carries sent_at so the email can say
--    which day, and the price count moves into the query so a job that
--    already has enough prices is filtered out rather than fetched and
--    skipped once per invitation.
-- 2. open_submission_to_market could now invite nobody — a direct offer that
--    lapses in a county whose other contractors are all outside the radius —
--    and leave the job 'distributed' with no invitations and no alert. It now
--    raises the same supply-gap alert distribute_submission does, with the
--    too_far count, so it is an admin task and not a silent expiry.
-- 3. Admin › Contractors counted invitations by reading the whole table
--    through PostgREST, which caps at 1000 rows and truncates silently. One
--    row per contractor from a view instead.

-- ── 1. Reminder tick ─────────────────────────────────────────────────────
create or replace function sq_invitation_reminder_tick() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  r           record;
  v_allowlist jsonb;
  v_n         int := 0;
  v_hours     int := app_config_num('sq_invite_reminder_hours', 24)::int;
  v_max       int := app_config_num('sq_invite_reminder_max_prices', 3)::int;
begin
  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  for r in
    select ji.id, ji.token, ji.distance_miles, ji.submission_id, ji.contractor_id, ji.sent_at,
           ct.email, p.prices
      from job_invitations ji
      join job_submissions js on js.id = ji.submission_id
      join contractors ct on ct.id = ji.contractor_id
      -- Once per job, not once per invitation, and decided in the query.
      join lateral (
        select count(distinct q.contractor_id) as prices
          from contractor_quotes q
         where q.submission_id = js.id and q.confirmed_by_contractor
      ) p on p.prices < v_max
     where ji.status = 'sent'
       and ji.sent_at <= now() - make_interval(hours => v_hours)
       and ji.sent_at >  now() - interval '3 days'
       and js.status in ('distributed', 'quotes_receiving')
       and js.market_opens_at is null
       and js.expires_at > now() + interval '24 hours'
       and ct.status = 'approved'
       and ct.vetted_at is not null
       and ct.notify_new_jobs
       -- Invitations sent before the radius existed include contractors it
       -- would now exclude; chasing those is the noise the radius removes.
       and sq_in_invite_range(js.lat, js.lng, ct.base_lat, ct.base_lng)
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
     order by ji.sent_at
  loop
    -- sq_notify_once is the once: (job, contractor, kind) is its key.
    if sq_notify_once(r.submission_id, r.contractor_id::text, 'sq_invitation_reminder', r.email,
         sq_job_facts(r.submission_id)
           || jsonb_build_object('token', r.token, 'distance_miles', r.distance_miles,
                                 'prices_so_far', r.prices, 'sent_at', r.sent_at)) then
      insert into invitation_events (invitation_id, contractor_id, event_type)
      values (r.id, r.contractor_id, 'reminded');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ── 2. A direct window that lapses into an empty field ───────────────────
create or replace function open_submission_to_market(p_submission_id uuid, p_reason text default 'customer')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js        job_submissions%rowtype;
  v_allowlist jsonb;
  v_match     record;
  v_invited   int := 0;
  v_too_far   int := 0;
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
$$;

-- ── 3. One row per contractor for the admin list ─────────────────────────
create or replace view admin_contractor_outreach as
  select c.id as contractor_id,
         (select count(*) from contractor_counties cc where cc.contractor_id = c.id)::int as counties,
         (select count(*) from job_invitations i where i.contractor_id = c.id)::int as invited,
         (select count(i.opened_at) from job_invitations i where i.contractor_id = c.id)::int as opened
    from contractors c;

-- Default privileges hand new relations to anon/authenticated (see
-- 20260922 PostgREST exposure fix); this is admin-only data.
revoke all on admin_contractor_outreach from public, anon, authenticated;
grant select on admin_contractor_outreach to service_role;
