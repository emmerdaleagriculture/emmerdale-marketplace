-- ============================================================================
-- An address that bounces stops getting jobs, not just email.
--
-- send-emails already refused to write to anything in undeliverable_emails,
-- but the invitation still went into job_invitations. A contractor whose
-- address was dead kept being "invited" to every job in their counties, kept
-- counting towards "invited N" on the customer's job, and kept being chosen
-- for first refusal and same-contractor offers, where the customer then
-- waited out a 24-48h window for someone who never heard about it.
--
-- Now:
--   * sq_invite_contractor declines to invite an undeliverable address. It is
--     the one function every route to an invitation goes through
--     (distribute_submission, open_submission_to_market,
--     invite_contractor_to_open_jobs), so one guard covers them all.
--   * The two direct offers in distribute_submission skip such a contractor
--     up front, so the job goes straight to the market instead of being held.
--   * A contractor proves a working address from /account; the app then
--     clears the address and calls invite_contractor_to_open_jobs to catch
--     them up on what is still open.
--
-- Transient bounces now count once their retries are spent (the webhook
-- change ships with this). The backfill below applies that rule to the
-- chains that have already run out.
-- ============================================================================

create or replace function email_undeliverable(p_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from undeliverable_emails where email = lower(trim(coalesce(p_email, '')))
  );
$$;

-- Default privileges grant new functions to anon/authenticated directly, so
-- "revoke from public" alone leaves this callable by anyone with the anon key
-- — and it would answer "does this address bounce?" for any address.
revoke execute on function email_undeliverable(text) from public, anon, authenticated;
grant execute on function email_undeliverable(text) to service_role;

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

  if v_ct.notify_new_jobs or coalesce((p_extra->>'direct')::boolean, false) then
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

  if v_direct.id is null then
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

-- ── Proving a new (or the same) address works ───────────────────────────────
-- A link sent to the address; opening it and pressing Confirm is the proof.
-- Supabase's own email change cannot do this job: with secure email change it
-- also wants a confirmation from the OLD address, which is the one that
-- bounces.
create table if not exists contractor_email_verifications (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  email         text not null,
  token         text not null unique,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours',
  used_at       timestamptz
);
create index if not exists contractor_email_verifications_contractor_idx
  on contractor_email_verifications (contractor_id, created_at desc);

alter table contractor_email_verifications enable row level security;
-- Service role only. The token is the credential, so no client may list them.
revoke all on contractor_email_verifications from public, anon, authenticated;

-- ── Backfill: transient bounces whose retries already ran out ───────────────
-- The same rule the webhook now applies: the last attempt (retry_count = 2)
-- bounced, and nothing has reached the address since.
insert into undeliverable_emails (email, first_seen_at, last_seen_at, bounces, last_kind, last_detail)
select lower(trim(p.to_email)), min(p.created_at), max(p.created_at), count(*),
       (array_agg(p.kind order by p.created_at desc))[1],
       (array_agg(p.delivery_detail order by p.created_at desc))[1]
  from pending_emails p
 where p.delivery_status = 'bounced'
   and coalesce(p.retry_count, 0) >= 2
   and not exists (
     select 1 from pending_emails d
      where lower(trim(d.to_email)) = lower(trim(p.to_email))
        and d.delivery_status = 'delivered'
        and d.created_at > p.created_at)
 group by lower(trim(p.to_email))
on conflict (email) do nothing;
