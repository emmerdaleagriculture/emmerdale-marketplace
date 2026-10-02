-- ============================================================================
-- A customer can pass on a price.
--
-- Until now a customer who did not like a price did nothing, and 90% of
-- priced jobs went quiet with no record of why. A pass is soft: the card
-- folds away on the customer's page (undo at any time), the contractor is
-- told the category — never free text — and invited to send a revised
-- price, which arrives as a new client_quotes row and so starts clean. A
-- pass closes nothing and counts nowhere in a contractor's standing; it is
-- the customer's budget, not the contractor's conduct.
--
-- The reasons are the first read on the commission split test
-- (20261002100000): "too expensive" per arm will speak long before bookings.
-- ============================================================================

create table if not exists client_quote_passes (
  client_quote_id uuid primary key references client_quotes(id) on delete cascade,
  submission_id   uuid not null references job_submissions(id) on delete cascade,
  contractor_id   uuid not null references contractors(id) on delete cascade,
  reason          text not null check (reason in ('too_expensive', 'too_far', 'visit_first', 'terms', 'other')),
  created_at      timestamptz not null default now(),
  -- Set when the customer changes their mind; the row stays for the numbers.
  undone_at       timestamptz
);
create index if not exists client_quote_passes_submission_idx on client_quote_passes (submission_id, created_at);
alter table client_quote_passes enable row level security;
revoke all on client_quote_passes from public, anon, authenticated;
grant all on client_quote_passes to service_role;

-- The customer passes on one price. The quote must belong to the job (the
-- caller has already bound the job to the token).
create or replace function sq_pass_price(p_submission_id uuid, p_client_quote_id uuid, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
  return jsonb_build_object('ok', true);
end;
$$;

-- The customer changes their mind. The contractor is not told: nothing was
-- taken from them, and a second email about the same price is noise.
create or replace function sq_unpass_price(p_submission_id uuid, p_client_quote_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_n int;
begin
  update client_quote_passes set undone_at = now()
   where client_quote_id = p_client_quote_id and submission_id = p_submission_id and undone_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform log_job_event(p_submission_id, 'price_pass_undone', null, null, 'client', null,
    'took back a pass on a price', jsonb_build_object('client_quote_id', p_client_quote_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Passes in the split-test reading ────────────────────────────────────
create or replace function admin_markup_test_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with arm as (
    select js.markup_arm, js.markup_rate, js.id, js.status, js.awarded_at, js.markup_assigned_at,
           (select count(*) from client_quotes q where q.submission_id = js.id) as prices,
           (select min(created_at) from client_quotes q where q.submission_id = js.id) as first_price_at,
           (select count(*) from client_quote_passes p where p.submission_id = js.id and p.undone_at is null) as passes,
           (select count(*) from client_quote_passes p where p.submission_id = js.id and p.undone_at is null and p.reason = 'too_expensive') as passes_price,
           cq.client_price_pence as booked_client_pence,
           ccq.contractor_price_pence as booked_contractor_pence
      from job_submissions js
      left join client_quotes cq on cq.id = js.accepted_client_quote_id
      left join contractor_quotes ccq on ccq.id = cq.contractor_quote_id
     where js.markup_arm is not null and js.hidden_at is null
  ),
  per as (
    select markup_arm,
      max(markup_rate) as rate,
      count(*) as jobs,
      count(*) filter (where prices > 0) as priced,
      sum(prices) as prices,
      sum(passes) as passes,
      sum(passes_price) as passes_price,
      count(*) filter (where awarded_at is not null) as booked,
      count(*) filter (where status in ('completed', 'paid')) as completed,
      count(*) filter (where status = 'cancelled') as cancelled,
      count(*) filter (where status in ('expired', 'no_quotes')) as lapsed,
      round(avg(booked_client_pence) filter (where awarded_at is not null)) as avg_client_pence,
      round(avg(booked_contractor_pence) filter (where awarded_at is not null)) as avg_contractor_pence,
      coalesce(sum(booked_client_pence - booked_contractor_pence) filter (where awarded_at is not null), 0) as margin_pence,
      round((percentile_cont(0.5) within group (order by extract(epoch from awarded_at - first_price_at) / 86400)
             filter (where awarded_at is not null and first_price_at is not null))::numeric, 1) as median_days_to_book,
      min(markup_assigned_at) as since
    from arm group by markup_arm
  )
  select jsonb_build_object(
    'enabled', app_config_num('sq_markup_test_enabled', 0) = 1,
    'rates', coalesce((select value from app_config where key = 'sq_markup_test_arms'), '{}'::jsonb),
    'arms', coalesce((select jsonb_object_agg(markup_arm, to_jsonb(per) - 'markup_arm') from per), '{}'::jsonb),
    'since', (select min(since) from per),
    -- All passes, every job, by reason: the reading that does not wait on the test.
    'passes_30d', coalesce((select jsonb_object_agg(reason, n) from (
        select reason, count(*) as n from client_quote_passes
         where undone_at is null and created_at > now() - interval '30 days' group by reason) r), '{}'::jsonb),
    'generated_at', now())
$$;

revoke execute on function sq_pass_price(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function sq_unpass_price(uuid, uuid)      from public, anon, authenticated;
grant  execute on function sq_pass_price(uuid, uuid, text) to service_role;
grant  execute on function sq_unpass_price(uuid, uuid)      to service_role;
