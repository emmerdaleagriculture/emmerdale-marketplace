-- ============================================================================
-- Open membership: £49 a month or £399 a year.
--
-- Everything premium gives (first refusal, 5% on prices sent through us), and
-- one thing more: the customer's contact details on every job they are
-- invited to, the moment they open it, with no price sent and no deposit
-- paid. An Open member can ring the customer and agree the work directly —
-- the marketplace is open to them. Pricing through us still works as usual,
-- at the premium rate.
--
-- Billing is the same subscriptions row, now carrying a tier. A contractor
-- has at most one membership; moving between tiers is a price change on the
-- Stripe subscription (src/lib/stripe.ts), not a second one.
--
-- Who saw whose details is recorded on the invitation (contact_revealed_at),
-- in invitation_events and in job_events, so the admin pages can say so and
-- a customer's "who has my number?" has an answer.
-- ============================================================================

-- ── Who is Open ──────────────────────────────────────────────────────────
alter table subscriptions add column if not exists tier text not null default 'premium'
  check (tier in ('premium', 'open'));
comment on column subscriptions.tier is
  'premium (£20/£199) or open (£49/£399). Set from the Stripe price lookup key by the webhook sync.';

alter table contractors add column if not exists open_comped_until timestamptz;
comment on column contractors.open_comped_until is
  'Admin-granted Open membership without a subscription, until this time. Implies premium.';

-- An Open comp is premium too: the tiers nest.
create or replace function contractor_is_premium(p_contractor_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from contractors c
                  where c.id = p_contractor_id
                    and (c.premium_comped_until > now() or c.open_comped_until > now()))
      or exists (select 1 from subscriptions s
                  where s.contractor_id = p_contractor_id
                    and s.status in ('active', 'past_due')
                    and coalesce(s.current_period_end, now()) > now() - interval '3 days')
$$;

-- 'open', 'premium' or null. Same lapse rules as contractor_is_premium.
create or replace function contractor_tier(p_contractor_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from contractors c
                  where c.id = p_contractor_id and c.open_comped_until > now()) then 'open'
    when exists (select 1 from subscriptions s
                  where s.contractor_id = p_contractor_id
                    and s.tier = 'open'
                    and s.status in ('active', 'past_due')
                    and coalesce(s.current_period_end, now()) > now() - interval '3 days') then 'open'
    when contractor_is_premium(p_contractor_id) then 'premium'
    else null
  end
$$;
revoke execute on function contractor_tier(uuid) from public, anon, authenticated;
grant execute on function contractor_tier(uuid) to service_role;

-- coalesce: contractor_tier is null for a non-member, and null = 'open' is
-- null, which an "if not …" in plpgsql would wave through.
create or replace function contractor_is_open(p_contractor_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(contractor_tier(p_contractor_id) = 'open', false)
$$;
revoke execute on function contractor_is_open(uuid) from public, anon, authenticated;
grant execute on function contractor_is_open(uuid) to service_role;

-- ── The reveal ───────────────────────────────────────────────────────────
alter table job_invitations add column if not exists contact_revealed_at timestamptz;
comment on column job_invitations.contact_revealed_at is
  'First time an Open member was shown the customer''s contact details on this invitation.';

alter table invitation_events drop constraint if exists invitation_events_event_type_check;
alter table invitation_events add constraint invitation_events_event_type_check
  check (event_type in ('sent','viewed','priced','revised','declined','undeclined','reminded',
                        'confirm_pending','confirmed','closed_awarded','closed_stale',
                        'contact_revealed'));

-- The customer's details for an Open member's live invitation. Refuses for
-- anyone else, and once the job has moved on: a passed invitation, a job
-- with an accepted price or awarded elsewhere shows nothing here (the
-- winner has them on /won). Records the first look.
create or replace function sq_reveal_contact(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv job_invitations%rowtype;
  v_js  job_submissions%rowtype;
  v_ct  contractors%rowtype;
begin
  select * into v_inv from job_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_ct from contractors where id = v_inv.contractor_id;
  if v_ct.status <> 'approved' or v_ct.vetted_at is null then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;
  if not contractor_is_open(v_ct.id) then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  select * into v_js from job_submissions where id = v_inv.submission_id;
  if v_js.status not in ('distributed', 'quotes_receiving')
     or v_inv.status in ('declined', 'closed_awarded', 'closed_stale') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if v_inv.contact_revealed_at is null then
    update job_invitations set contact_revealed_at = now() where id = v_inv.id
      returning contact_revealed_at into v_inv.contact_revealed_at;
    insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
    values (v_inv.id, v_ct.id, 'contact_revealed', jsonb_build_object('tier', 'open'));
    perform log_job_event(v_js.id, 'contact_revealed', null, null, 'contractor', v_ct.id, null,
      jsonb_build_object('invitation_id', v_inv.id, 'tier', 'open'));
  end if;

  return jsonb_build_object(
    'ok', true,
    'contact_name', v_js.contact_name,
    'contact_phone', v_js.contact_phone,
    'contact_email', v_js.contact_email,
    'postcode', v_js.postcode,
    'gate_w3w', v_js.gate_w3w,
    'revealed_at', v_inv.contact_revealed_at);
end;
$$;
revoke execute on function sq_reveal_contact(text) from public, anon, authenticated;
grant execute on function sq_reveal_contact(text) to service_role;

-- ── The invitation says so ───────────────────────────────────────────────
-- Body as live (20261003170000) plus one payload key: the email, text and
-- push can tell an Open member the details are on the page.
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
        || jsonb_build_object('token', v_inv.token, 'distance_miles', v_inv.distance_miles,
                              'open_member', contractor_is_open(v_ct.id))
        || coalesce(p_extra, '{}'::jsonb));
  end if;
  return true;
end;
$function$;

-- ── Admin figures: by tier ───────────────────────────────────────────────
create or replace function admin_premium_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with paid as (
    select s.*, c.business_name
      from subscriptions s join contractors c on c.id = s.contractor_id
     where s.status in ('active', 'past_due')
  ),
  comped as (
    select c.id as contractor_id, c.business_name,
           greatest(c.premium_comped_until, c.open_comped_until) as comped_until,
           case when c.open_comped_until > now() then 'open' else 'premium' end as tier
      from contractors c
     where (c.premium_comped_until > now() or c.open_comped_until > now())
       and not exists (select 1 from paid p where p.contractor_id = c.id)
  ),
  members as (
    select contractor_id, business_name, plan as kind, tier, status, started_at,
           current_period_end as until, cancel_at_period_end as cancelling
      from paid
    union all
    select contractor_id, business_name, 'comped', tier, 'active', null, comped_until, false
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
    'open',       (select count(*) from paid where tier = 'open'),
    'open_comped', (select count(*) from comped where tier = 'open'),
    'past_due',   (select count(*) from paid where status = 'past_due'),
    'cancelling', (select count(*) from paid where cancel_at_period_end),
    'comped',     (select count(*) from comped),
    'new_30d',    (select count(*) from subscriptions where started_at > now() - interval '30 days'),
    -- Joined in the onboarding step, before approval. Rejected applicants are
    -- refunded and deleted, so they leave no row to count here.
    'at_signup_30d', (select count(*) from subscriptions s join contractors c on c.id = s.contractor_id
                       where s.started_at > now() - interval '30 days'
                         and (c.vetted_at is null or s.started_at < c.vetted_at)),
    'awaiting_approval', (select count(*) from paid p join contractors c on c.id = p.contractor_id
                           where c.vetted_at is null),
    'ended_30d',  (select count(*) from subscriptions where ended_at > now() - interval '30 days'),
    -- Annual plans spread over twelve months.
    'mrr_pence',  (select coalesce(sum(case
                      when tier = 'open' and plan = 'annual' then 39900 / 12.0
                      when tier = 'open' then 4900
                      when plan = 'annual' then 19900 / 12.0
                      else 2000 end), 0)::int
                     from paid),
    -- Open members shown a customer's details, 30 days.
    'reveals_30d', (select jsonb_build_object(
                      'reveals', count(*),
                      'jobs', count(distinct submission_id),
                      'members', count(distinct contractor_id))
                    from job_invitations
                    where contact_revealed_at > now() - interval '30 days'),
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
                  'id', m.contractor_id, 'name', m.business_name, 'kind', m.kind, 'tier', m.tier,
                  'status', m.status, 'since', m.started_at, 'until', m.until,
                  'cancelling', m.cancelling,
                  'offered_30d', (select count(*) from job_invitations ji
                                   where ji.contractor_id = m.contractor_id and ji.premium_offer
                                     and ji.sent_at > now() - interval '30 days'),
                  'revealed_30d', (select count(*) from job_invitations ji
                                    where ji.contractor_id = m.contractor_id
                                      and ji.contact_revealed_at > now() - interval '30 days'),
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
