-- ============================================================================
-- Premium membership: £20 a month or £199 a year.
--
-- Two things for the money:
--   1. First refusal. A new job goes to every premium member in range before
--      anyone else, for up to sq_premium_window_hours (7 days). The market
--      opens when that lapses or as soon as every premium member offered it
--      has priced or passed. In HPM's area HPM's own 24h first refusal still
--      runs first; premium comes after it, then the market. Repeat jobs keep
--      their direct offer and skip premium: the customer asked for someone.
--   2. Commission. sq_premium_markup_rate (5%) on every price a premium member
--      publishes, against the standing 15% for everyone else. The customer
--      sees our price, so the same contractor figure lands 10 points cheaper,
--      or a premium member can charge more and still show the same price.
--
-- The commission split test ends here: non-premium prices go to 15%. Jobs
-- already in an arm keep their rate (sq_job_markup_rate reads the stamp).
--
-- Billing reuses the dormant subscriptions table and Stripe routes from the
-- original paid tier. Premium is "Stripe says active (or past due, while it
-- retries), within 3 days of the period end", or an admin comp.
-- ============================================================================

-- ── Who is premium ──────────────────────────────────────────────────────
alter table subscriptions add column if not exists plan text check (plan in ('monthly', 'annual'));
alter table subscriptions add column if not exists cancel_at_period_end boolean not null default false;
-- Set by the webhook sync (src/lib/stripe.ts) as a membership starts and ends,
-- for the admin figures: Stripe holds the history, this holds enough to count.
alter table subscriptions add column if not exists started_at timestamptz;
alter table subscriptions add column if not exists ended_at timestamptz;

alter table contractors add column if not exists premium_comped_until timestamptz;
comment on column contractors.premium_comped_until is
  'Admin-granted premium without a subscription, until this time.';

create or replace function contractor_is_premium(p_contractor_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from contractors c
                  where c.id = p_contractor_id and c.premium_comped_until > now())
      or exists (select 1 from subscriptions s
                  where s.contractor_id = p_contractor_id
                    and s.status in ('active', 'past_due')
                    and coalesce(s.current_period_end, now()) > now() - interval '3 days')
$$;
revoke execute on function contractor_is_premium(uuid) from public, anon, authenticated;
grant execute on function contractor_is_premium(uuid) to service_role;

alter table client_quotes add column if not exists premium boolean not null default false;
comment on column client_quotes.premium is
  'Published by a premium member, at the premium rate. The rate alone cannot say: a 5% split-test arm priced the same.';

-- ── The window ──────────────────────────────────────────────────────────
alter table job_submissions add column if not exists premium_window boolean not null default false;
comment on column job_submissions.premium_window is
  'The job went to premium members first. While market_opens_at is set, the window is running.';
alter table job_invitations add column if not exists premium_offer boolean not null default false;
comment on column job_invitations.premium_offer is
  'Sent during a premium window, as first refusal.';

insert into app_config (key, value) values
  ('sq_premium_window_hours', '168'),
  ('sq_premium_markup_rate', '0.05')
on conflict (key) do nothing;

-- End the split test; 15% for everyone who isn't premium.
update app_config set value = '0' where key = 'sq_markup_test_enabled';
update app_config set value = '0.15' where key = 'sq_markup_rate';

-- Invites every premium member in range who doesn't already have the job,
-- and holds the job for them. Returns how many were invited; 0 changes
-- nothing. Callers hold the job row lock.
create or replace function sq_start_premium_window(p_submission_id uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js        job_submissions%rowtype;
  v_allowlist jsonb;
  v_ct        record;
  v_n         int := 0;
  v_hours     int := app_config_num('sq_premium_window_hours', 168)::int;
  v_opens     timestamptz;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  if not found or v_js.premium_window or v_js.repeat_of is not null
     or v_js.extra_work_of is not null or v_hours <= 0 then
    return 0;
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);
  v_opens := now() + make_interval(hours => v_hours);

  for v_ct in
    select ct.id
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id and cc.county_id = v_js.county_id
     where ct.status = 'approved'
       and ct.vetted_at is not null
       and contractor_is_premium(ct.id)
       and sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles)
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
       and not exists (select 1 from job_invitations ji
                        where ji.submission_id = v_js.id and ji.contractor_id = ct.id)
  loop
    if sq_invite_contractor(v_js.id, v_ct.id,
         jsonb_build_object('premium', true, 'market_opens_at', v_opens)) then
      update job_invitations set premium_offer = true
       where submission_id = v_js.id and contractor_id = v_ct.id;
      v_n := v_n + 1;
    end if;
  end loop;

  if v_n > 0 then
    update job_submissions
       set premium_window = true,
           market_opens_at = v_opens,
           expires_at = greatest(coalesce(expires_at, now()),
             v_opens + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int))
     where id = v_js.id;
    perform log_job_event(v_js.id, 'premium_window', null, null, 'system', null, null,
      jsonb_build_object('invited', v_n, 'market_opens_at', v_opens));
  end if;
  return v_n;
end;
$$;
revoke execute on function sq_start_premium_window(uuid) from public, anon, authenticated;

-- ── Redefinitions (bodies as live, with the premium stage added) ───────

CREATE OR REPLACE FUNCTION public.sq_invite_contractor(p_submission_id uuid, p_contractor_id uuid, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js  job_submissions%rowtype;
  v_ct  contractors%rowtype;
  v_inv job_invitations%rowtype;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  select * into v_ct from contractors where id = p_contractor_id;
  if v_js.id is null or v_ct.id is null then return false; end if;

  -- Their email bounces, so they would never hear about it. Not invited at
  -- all, rather than invited silently: an invitation nobody can see still
  -- counts as "invited" to the customer and the admin. They are caught up
  -- by invite_contractor_to_open_jobs once they fix the address.
  if email_undeliverable(v_ct.email) then return false; end if;

  insert into job_invitations (submission_id, contractor_id, token, distance_miles)
  values (v_js.id, v_ct.id, sq_token(),
          round(haversine_miles(v_js.lat, v_js.lng, v_ct.base_lat, v_ct.base_lng), 1))
  on conflict (submission_id, contractor_id) do nothing
  returning * into v_inv;
  if not found then return false; end if;

  insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
  values (v_inv.id, v_ct.id, 'sent', coalesce(p_extra, '{}'::jsonb));

  if v_ct.notify_new_jobs or coalesce((p_extra->>'direct')::boolean, false)
     or coalesce((p_extra->>'premium')::boolean, false) then
    perform sq_notify_once(v_js.id, v_ct.id::text, 'sq_invitation', v_ct.email,
      sq_job_facts(v_js.id)
        || jsonb_build_object('token', v_inv.token, 'distance_miles', v_inv.distance_miles)
        || coalesce(p_extra, '{}'::jsonb));
  end if;
  return true;
end;
$function$;

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
  v_premium    boolean := false;
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
       -- Their email bounces: they would never see the offer, and the
       -- customer would wait out the whole window for nobody.
       and not email_undeliverable(ct.email)
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
         -- Only within the contractor's reach: HPM's counties run 80+ miles
         -- from its base, and an out-of-range offer is a decline and a delay.
         and sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles)
         and ct.status = 'approved'
         and ct.vetted_at is not null
         and not email_undeliverable(ct.email)
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

  -- Premium members in range get it before the market: up to
  -- sq_premium_window_hours, or until every one of them has priced or passed.
  if v_direct.id is null and v_js.repeat_of is null then
    v_invited := sq_start_premium_window(v_js.id);
    if v_invited > 0 then
      v_premium := true;
      select market_opens_at into v_opens from job_submissions where id = v_js.id;
    end if;
  end if;

  if v_direct.id is null and not v_premium then
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
         expires_at = greatest(coalesce(v_opens, now()), now())
                      + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int),
         market_opens_at = v_opens
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'confirmed', 'distributed', 'system', null, null,
    jsonb_build_object('invited_count', v_invited, 'direct_contractor_id', v_direct.id,
                       'direct_unavailable', v_unavailable, 'first_refusal', v_first,
                       'premium_window', v_premium, 'too_far', v_too_far));

  -- A first-refusal or premium-window job reads to the customer as an
  -- ordinary one: no name, no date.
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_portal_link',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
      'direct_contractor', case when v_first or v_premium then null else v_direct.business_name end,
      'market_opens_at', case when v_first or v_premium then null else v_opens end,
      'direct_unavailable', v_unavailable));

  return jsonb_build_object('ok', true, 'invited', v_invited, 'too_far', v_too_far,
                            'direct', v_direct.id is not null, 'first_refusal', v_first,
                            'premium_window', v_premium);
end;
$function$;

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
  -- lapses, is declined or sits unaccepted goes to premium members before the
  -- market. Once only — the premium window's own ending opens the market.
  if v_js.first_refusal and not v_js.premium_window
     and p_reason in ('declined', 'timeout', 'unaccepted') then
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
$function$;

CREATE OR REPLACE FUNCTION public.sq_direct_window_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r     record;
  v_n   int := 0;
begin
  for r in
    -- Branch A, unchanged: the contractor never priced it. Opens when their
    -- window lapses, when they decline, or when there is no preferred
    -- contractor to wait for.
    select js.id,
           case
             when exists (select 1 from job_invitations ji
                           where ji.submission_id = js.id
                             and ji.contractor_id = js.preferred_contractor_id
                             and ji.status = 'declined') then 'declined'
             else 'timeout'
           end as reason
      from job_submissions js
     where js.market_opens_at is not null
       and not js.premium_window
       and js.status in ('distributed', 'quotes_receiving')
       and not exists (select 1 from contractor_quotes q
                        where q.submission_id = js.id
                          and q.contractor_id = js.preferred_contractor_id
                          and q.confirmed_by_contractor)
       and (js.market_opens_at <= now()
            or js.preferred_contractor_id is null
            or exists (select 1 from job_invitations ji
                        where ji.submission_id = js.id
                          and ji.contractor_id = js.preferred_contractor_id
                          and ji.status = 'declined'))

    union all

    -- Branch B, new: they DID price it, and the customer has sat on it. Keyed
    -- to quotes_notified_at and NOT to market_opens_at — that one is the
    -- pricing window, is long past on any job that reached this state, and
    -- would fire every such job on the next tick.
    select js.id, 'unaccepted' as reason
      from job_submissions js
     where js.first_refusal
       and not js.premium_window
       and js.market_opens_at is not null
       and js.status in ('distributed', 'quotes_receiving')
       and js.quotes_notified_at is not null
       and js.quotes_notified_at
             <= now() - make_interval(hours => app_config_num('sq_first_refusal_accept_hours', 48)::int)
       and exists (select 1 from contractor_quotes q
                    where q.submission_id = js.id
                      and q.contractor_id = js.preferred_contractor_id
                      and q.confirmed_by_contractor)
       -- Belt and braces. The status filter above already excludes an accepted
       -- job (accept moves it to accepted_awaiting_payment), but a job whose
       -- price the customer has taken must never be reopened under any
       -- ordering.
       and not exists (select 1 from client_quotes cq
                        where cq.submission_id = js.id
                          and cq.status = 'accepted')
       and js.accepted_client_quote_id is null

    union all

    -- Branch C: a premium window. Opens when it lapses, or as soon as every
    -- premium member offered it has priced or passed.
    select js.id,
           case when js.market_opens_at <= now() then 'premium_timeout'
                else 'premium_answered' end as reason
      from job_submissions js
     where js.premium_window
       and js.market_opens_at is not null
       and js.status in ('distributed', 'quotes_receiving')
       and (js.market_opens_at <= now()
            or not exists (select 1 from job_invitations ji
                            where ji.submission_id = js.id
                              and ji.premium_offer
                              and ji.status in ('sent', 'viewed')))
  loop
    perform open_submission_to_market(r.id, r.reason);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
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
  v_ct contractors%rowtype;
  v_premium boolean;
begin
  select * into v_cq from contractor_quotes where id = p_quote_id;
  select * into v_js from job_submissions where id = v_cq.submission_id;
  select * into v_ct from contractors where id = v_cq.contractor_id;
  -- The job's own rate: assigned on its first price (a split-test arm, or
  -- the standing rate), and the same for every price on the job after.
  v_rate := sq_job_markup_rate(v_cq.submission_id);
  -- Premium members pay the premium rate on every price, whatever the job's.
  v_premium := contractor_is_premium(v_cq.contractor_id);
  if v_premium then
    v_rate := least(v_rate, app_config_num('sq_premium_markup_rate', 0.05));
  end if;

  -- Stable label, shared with the message thread: a contractor who asked the
  -- customer a question before pricing already has one (20260925140000).
  v_label := sq_invitation_label(v_cq.invitation_id);

  insert into client_quotes (
    submission_id, contractor_quote_id, contractor_id,
    client_price_pence, markup_rate, premium,
    client_rate_value_pence, client_rate_minimum_pence,
    contractor_display_label, contractor_rating_avg, contractor_rating_count,
    distance_miles, site_visit_required, valid_until, price_basis,
    contractor_note, unit_label, unit_quantity
  )
  select
    v_cq.submission_id, v_cq.id, v_cq.contractor_id,
    client_price_pence(v_cq.contractor_price_pence, v_rate), v_rate, v_premium,
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
      'sole_offer', v_js.first_refusal and not v_js.premium_window
                    and v_js.market_opens_at is not null
                    and v_js.preferred_contractor_id = v_cq.contractor_id));
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_contractor_to_open_jobs(p_contractor_id uuid, p_county_id integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ct        contractors%rowtype;
  v_allowlist jsonb;
  v_js        record;
  v_invited   int := 0;
  v_premium   boolean := contractor_is_premium(p_contractor_id);
begin
  select * into v_ct from contractors where id = p_contractor_id;
  if not found or v_ct.status <> 'approved' or v_ct.vetted_at is null then
    return 0;
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);
  if jsonb_array_length(v_allowlist) > 0
     and v_ct.email not in (select jsonb_array_elements_text(v_allowlist)) then
    return 0;
  end if;

  for v_js in
    select js.id, js.market_opens_at
      from job_submissions js
      join contractor_counties cc
        on cc.county_id = js.county_id and cc.contractor_id = v_ct.id
     where js.status in ('distributed', 'quotes_receiving')
       -- Held jobs are someone's window — except a premium window, which a
       -- premium member joins late like any other.
       and (js.market_opens_at is null
            or (js.premium_window and v_premium))
       and js.expires_at > now() + make_interval(hours => app_config_num('sq_late_invite_min_hours', 12)::int)
       and (p_county_id is null or js.county_id = p_county_id)
       and sq_in_invite_range(js.lat, js.lng, v_ct.base_lat, v_ct.base_lng, v_ct.invite_radius_miles)
     order by js.expires_at
       for share of js skip locked
  loop
    if v_js.market_opens_at is not null then
      if sq_invite_contractor(v_js.id, v_ct.id, jsonb_build_object(
           'late_join', true, 'premium', true, 'market_opens_at', v_js.market_opens_at)) then
        update job_invitations set premium_offer = true
         where submission_id = v_js.id and contractor_id = v_ct.id;
        v_invited := v_invited + 1;
      end if;
    elsif sq_invite_contractor(v_js.id, v_ct.id, jsonb_build_object('late_join', true)) then
      v_invited := v_invited + 1;
    end if;
  end loop;

  return v_invited;
end;
$function$;

-- ── The contractor's own list: premium windows count as "offered to you" ─
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
            WHEN i.premium_offer AND js.premium_window THEN js.market_opens_at
            ELSE NULL::timestamp with time zone
        END AS offered_until,
    i.premium_offer
   FROM job_invitations i
     JOIN job_submissions js ON js.id = i.submission_id
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
  WHERE i.contractor_id = auth.uid();

-- ── Admin figures ───────────────────────────────────────────────────────
create or replace function admin_premium_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with paid as (
    select s.*, c.business_name
      from subscriptions s join contractors c on c.id = s.contractor_id
     where s.status in ('active', 'past_due')
  ),
  comped as (
    select c.id as contractor_id, c.business_name, c.premium_comped_until
      from contractors c
     where c.premium_comped_until > now()
       and not exists (select 1 from paid p where p.contractor_id = c.id)
  ),
  members as (
    select contractor_id, business_name, plan as kind, status, started_at,
           current_period_end as until, cancel_at_period_end as cancelling
      from paid
    union all
    select contractor_id, business_name, 'comped', 'active', null, premium_comped_until, false
      from comped
  ),
  windows as (
    select js.id, js.accepted_client_quote_id, js.awarded_at,
           exists (select 1 from client_quotes q where q.submission_id = js.id and q.premium) as premium_priced
      from job_submissions js
     where js.premium_window and js.created_at > now() - interval '30 days'
  ),
  prices as (
    select q.id, q.client_price_pence, cq.contractor_price_pence,
           (js.accepted_client_quote_id = q.id and js.awarded_at is not null) as booked
      from client_quotes q
      join contractor_quotes cq on cq.id = q.contractor_quote_id
      join job_submissions js on js.id = q.submission_id
     where q.premium and q.created_at > now() - interval '30 days'
  )
  select jsonb_build_object(
    'paid',       (select count(*) from paid),
    'monthly',    (select count(*) from paid where plan = 'monthly'),
    'annual',     (select count(*) from paid where plan = 'annual'),
    'past_due',   (select count(*) from paid where status = 'past_due'),
    'cancelling', (select count(*) from paid where cancel_at_period_end),
    'comped',     (select count(*) from comped),
    'new_30d',    (select count(*) from subscriptions where started_at > now() - interval '30 days'),
    'ended_30d',  (select count(*) from subscriptions where ended_at > now() - interval '30 days'),
    -- Annual plans spread over twelve months.
    'mrr_pence',  (select coalesce(sum(case plan when 'annual' then 19900 / 12.0 else 2000 end), 0)::int
                     from paid),
    'windows_30d', (select jsonb_build_object(
                      'jobs', count(*),
                      'premium_priced', count(*) filter (where premium_priced),
                      'premium_booked', count(*) filter (where exists (
                        select 1 from client_quotes q
                         where q.id = windows.accepted_client_quote_id and q.premium
                           and windows.awarded_at is not null)))
                    from windows),
    'prices_30d', (select jsonb_build_object(
                     'prices', count(*),
                     'booked', count(*) filter (where booked),
                     'margin_pence', coalesce(sum(client_price_pence - contractor_price_pence)
                                                filter (where booked), 0))
                   from prices),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', m.contractor_id, 'name', m.business_name, 'kind', m.kind,
                  'status', m.status, 'since', m.started_at, 'until', m.until,
                  'cancelling', m.cancelling,
                  'offered_30d', (select count(*) from job_invitations ji
                                   where ji.contractor_id = m.contractor_id and ji.premium_offer
                                     and ji.sent_at > now() - interval '30 days'),
                  'priced_30d', (select count(*) from client_quotes q
                                  where q.contractor_id = m.contractor_id and q.premium
                                    and q.created_at > now() - interval '30 days'),
                  'won_30d', (select count(*) from job_submissions js
                               where js.awarded_contractor_id = m.contractor_id
                                 and js.awarded_at > now() - interval '30 days'))
                  order by m.started_at nulls last, m.business_name)
                from members m), '[]'::jsonb)
  )
$$;
revoke execute on function admin_premium_summary() from public, anon, authenticated;
grant execute on function admin_premium_summary() to service_role;
