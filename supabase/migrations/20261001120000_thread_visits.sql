-- ============================================================================
-- A site visit arranged in the messages, before anything is booked.
--
-- On 29 Sep 2026 a customer and a contractor arranged a visit by swapping a
-- phone number and a home address in the thread, because there was no other
-- way to get a contractor onto the ground before they priced. This gives
-- them one:
--
--   1. Either side proposes a date and time in the thread (pre-award only).
--      A new proposal replaces one still waiting for an answer, so "how about
--      Thursday instead?" is just another proposal.
--   2. The other side accepts or declines. Accepting releases, to the two of
--      them only: the customer's name, full postcode, gate what3words and
--      phone to the contractor; the contractor's business name and phone to
--      the customer — whoever is coming onto their land is not a letter.
--   3. Either side can call an accepted visit off before it happens. The
--      details go back behind the mask with it.
--
-- When the thread leaves pre-award, a proposal still waiting lapses, and an
-- accepted visit still to come is called off and both sides are told —
-- unless this contractor won the job, in which case it is their visit to
-- keep. Nothing is offered to a contractor whose messages are moderated: a
-- visit hands over exactly what moderation is holding back.
--
-- Named thread_visits / sq_thread_visit_* to keep it apart from the
-- post-award price-confirmation visit (20260930160000, visit_status on
-- job_submissions and the sq_visit_* functions).
--
-- Nothing here is reachable by anon or authenticated: both pages are
-- token-addressed and go through the service role, as job_messages does.
-- ============================================================================

create table if not exists thread_visits (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references job_submissions(id) on delete cascade,
  invitation_id  uuid not null references job_invitations(id) on delete cascade,
  proposed_by    text not null check (proposed_by in ('client', 'contractor')),
  starts_at      timestamptz not null,
  status         text not null default 'proposed'
                   check (status in ('proposed', 'accepted', 'declined', 'withdrawn', 'cancelled', 'lapsed')),
  -- Who called an accepted visit off: one of the two, or 'system' when the
  -- job moved on.
  cancelled_by   text check (cancelled_by in ('client', 'contractor', 'system')),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);
-- One live visit per thread: a proposal waiting, or one agreed.
create unique index if not exists thread_visits_one_open
  on thread_visits (invitation_id) where status in ('proposed', 'accepted');
create index if not exists thread_visits_submission_idx on thread_visits (submission_id, created_at);

alter table thread_visits enable row level security;
revoke all on thread_visits from public, anon, authenticated;
grant all on thread_visits to service_role;

-- ── Telling the other side ──────────────────────────────────────────────
-- p_event: 'proposed' | 'accepted' | 'declined' | 'withdrawn' | 'cancelled'
-- | 'off' (the job moved on). p_to: who is told. One email per visit, event
-- and recipient.
create or replace function sq_thread_visit_notify(p_visit_id uuid, p_event text, p_to text, p_reason text default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_v   thread_visits%rowtype;
  v_inv job_invitations%rowtype;
  v_js  job_submissions%rowtype;
  v_ct  contractors%rowtype;
  v_payload jsonb;
begin
  select * into v_v from thread_visits where id = p_visit_id;
  select * into v_inv from job_invitations where id = v_v.invitation_id;
  select * into v_js from job_submissions where id = v_v.submission_id;
  select * into v_ct from contractors where id = v_inv.contractor_id;

  v_payload := jsonb_build_object(
    'event', p_event,
    'reason', p_reason,
    'starts_at', v_v.starts_at,
    'proposed_by', v_v.proposed_by,
    'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
    'postcode_district', split_part(v_js.postcode, ' ', 1));

  if p_to = 'contractor' then
    if v_ct.email is null then return; end if;
    perform sq_notify_once(v_js.id, v_inv.contractor_id::text || ':tvisit:' || v_v.id || ':' || p_event,
      'sq_thread_visit_to_contractor', v_ct.email,
      v_payload || jsonb_build_object('token', v_inv.token));
  else
    if v_js.contact_email is null then return; end if;
    perform sq_notify_once(v_js.id, v_js.contact_email || ':tvisit:' || v_v.id || ':' || p_event,
      'sq_thread_visit_to_client', v_js.contact_email,
      v_payload || jsonb_build_object(
        'client_token', v_js.client_token,
        'contact_name', v_js.contact_name,
        -- The customer learns the name only once a visit is agreed.
        'from', case when v_v.status in ('accepted', 'cancelled') or p_event = 'accepted'
                     then v_ct.business_name else v_inv.display_label end));
  end if;
end;
$$;

-- ── Who may arrange a visit on this thread, now ─────────────────────────
-- null when they may, otherwise the reason.
create or replace function sq_thread_visit_blocked(p_invitation_id uuid, p_by text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when sq_thread_state(p_invitation_id) is distinct from 'pre_award' then 'closed'
    when ct.messages_moderated_until > now() then 'moderated'
    -- The customer can only see labelled threads. A contractor suggesting a
    -- visit first is what gives the thread its label, as a first message does.
    when p_by = 'client' and ji.display_label is null then 'no_thread'
  end
  from job_invitations ji
  join contractors ct on ct.id = ji.contractor_id
  where ji.id = p_invitation_id
$$;

-- ── Propose ─────────────────────────────────────────────────────────────
-- p_local is the date and time as typed, in London: '2026-10-09 10:30'.
create or replace function sq_thread_visit_propose(p_invitation_id uuid, p_by text, p_local text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv     job_invitations%rowtype;
  v_at      timestamptz;
  v_blocked text;
  v_open    thread_visits%rowtype;
  v_id      uuid;
begin
  if p_by not in ('client', 'contractor') then
    return jsonb_build_object('ok', false, 'reason', 'bad_sender');
  end if;
  begin
    v_at := (p_local::timestamp) at time zone 'Europe/London';
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad_time');
  end;
  if v_at < now() + interval '2 hours' or v_at > now() + interval '60 days' then
    return jsonb_build_object('ok', false, 'reason', 'bad_time');
  end if;

  select * into v_inv from job_invitations where id = p_invitation_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  -- Lock order as sq_post_message: the job first, then anything of the thread's.
  perform 1 from job_submissions where id = v_inv.submission_id for key share;

  v_blocked := sq_thread_visit_blocked(p_invitation_id, p_by);
  if v_blocked is not null then return jsonb_build_object('ok', false, 'reason', v_blocked); end if;
  -- After the job row, as sq_invitation_label requires.
  perform sq_invitation_label(p_invitation_id);

  if (select count(*) from thread_visits
       where invitation_id = p_invitation_id and proposed_by = p_by
         and created_at > now() - interval '24 hours') >= 6 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  select * into v_open from thread_visits
   where invitation_id = p_invitation_id and status in ('proposed', 'accepted')
   for update;
  if found then
    if v_open.status = 'accepted' then
      return jsonb_build_object('ok', false, 'reason', 'already_agreed');
    end if;
    -- A new time replaces the one waiting for an answer, from either side.
    update thread_visits set status = 'withdrawn', decided_at = now() where id = v_open.id;
  end if;

  insert into thread_visits (submission_id, invitation_id, proposed_by, starts_at)
  values (v_inv.submission_id, p_invitation_id, p_by, v_at)
  returning id into v_id;

  perform log_job_event(v_inv.submission_id, 'visit_proposed', null, null,
    case when p_by = 'client' then 'client' else 'contractor' end,
    case when p_by = 'contractor' then v_inv.contractor_id end,
    'site visit proposed in the messages', jsonb_build_object('visit_id', v_id, 'starts_at', v_at));
  perform sq_thread_visit_notify(v_id, 'proposed', case when p_by = 'client' then 'contractor' else 'client' end);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── Accept or decline (the side that didn't propose) ────────────────────
create or replace function sq_thread_visit_answer(
  p_visit_id uuid, p_invitation_id uuid, p_by text, p_accept boolean
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_v       thread_visits%rowtype;
  v_blocked text;
begin
  select * into v_v from thread_visits where id = p_visit_id and invitation_id = p_invitation_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform 1 from job_submissions where id = v_v.submission_id for key share;
  select * into v_v from thread_visits where id = p_visit_id for update;

  if v_v.status <> 'proposed' then return jsonb_build_object('ok', false, 'reason', 'not_open'); end if;
  if v_v.proposed_by = p_by then return jsonb_build_object('ok', false, 'reason', 'own_proposal'); end if;
  if p_accept then
    v_blocked := sq_thread_visit_blocked(p_invitation_id, p_by);
    if v_blocked is not null then return jsonb_build_object('ok', false, 'reason', v_blocked); end if;
    if v_v.starts_at <= now() then return jsonb_build_object('ok', false, 'reason', 'past'); end if;
  end if;

  update thread_visits
     set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
   where id = v_v.id;
  perform log_job_event(v_v.submission_id, case when p_accept then 'visit_agreed' else 'visit_declined' end,
    null, null, p_by, null,
    case when p_accept then 'site visit agreed in the messages; contact details released to both'
         else 'site visit declined' end,
    jsonb_build_object('visit_id', v_v.id, 'starts_at', v_v.starts_at));
  perform sq_thread_visit_notify(v_v.id, case when p_accept then 'accepted' else 'declined' end, v_v.proposed_by);
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Withdraw a proposal, or call off an agreed visit ────────────────────
create or replace function sq_thread_visit_cancel(p_visit_id uuid, p_invitation_id uuid, p_by text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_v thread_visits%rowtype;
begin
  select * into v_v from thread_visits where id = p_visit_id and invitation_id = p_invitation_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform 1 from job_submissions where id = v_v.submission_id for key share;
  select * into v_v from thread_visits where id = p_visit_id for update;

  if v_v.status = 'proposed' then
    if v_v.proposed_by <> p_by then return jsonb_build_object('ok', false, 'reason', 'not_yours'); end if;
    update thread_visits set status = 'withdrawn', decided_at = now() where id = v_v.id;
    perform sq_thread_visit_notify(v_v.id, 'withdrawn', case when p_by = 'client' then 'contractor' else 'client' end);
  elsif v_v.status = 'accepted' then
    if v_v.starts_at <= now() then return jsonb_build_object('ok', false, 'reason', 'past'); end if;
    update thread_visits set status = 'cancelled', cancelled_by = p_by, decided_at = now() where id = v_v.id;
    perform log_job_event(v_v.submission_id, 'visit_cancelled', null, null, p_by, null,
      'agreed site visit called off', jsonb_build_object('visit_id', v_v.id, 'starts_at', v_v.starts_at));
    perform sq_thread_visit_notify(v_v.id, 'cancelled', case when p_by = 'client' then 'contractor' else 'client' end);
  else
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── When the job moves on ───────────────────────────────────────────────
create or replace function sq_thread_visits_sweep(p_submission_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  r        record;
  v_state  text;
  v_reason text;
begin
  for r in
    select tv.*, ji.contractor_id, ji.status as inv_status, js.awarded_contractor_id
      from thread_visits tv
      join job_invitations ji on ji.id = tv.invitation_id
      join job_submissions js on js.id = tv.submission_id
     where tv.submission_id = p_submission_id and tv.status in ('proposed', 'accepted')
  loop
    v_state := sq_thread_state(r.invitation_id);
    continue when v_state = 'pre_award';

    if r.status = 'proposed' then
      update thread_visits set status = 'lapsed', decided_at = now() where id = r.id;
    elsif v_state <> 'post_award' and r.starts_at > now() then
      -- Agreed, still to come, and this contractor isn't getting the job.
      v_reason := case
        when r.inv_status = 'declined' then 'contractor_passed'
        when r.awarded_contractor_id is not null then 'booked_elsewhere'
        else 'job_closed' end;
      update thread_visits set status = 'cancelled', cancelled_by = 'system', decided_at = now()
       where id = r.id;
      perform log_job_event(p_submission_id, 'visit_cancelled', null, null, 'system', null,
        'agreed site visit called off: ' || v_reason, jsonb_build_object('visit_id', r.id));
      if v_reason <> 'contractor_passed' then
        perform sq_thread_visit_notify(r.id, 'off', 'contractor', v_reason);
      end if;
      perform sq_thread_visit_notify(r.id, 'off', 'client', v_reason);
    end if;
    -- Agreed and already past, or this contractor won: left as it is.
  end loop;
end;
$$;

create or replace function sq_thread_visits_on_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sq_thread_visits_sweep(new.id);
  return null;
end;
$$;
drop trigger if exists job_submissions_thread_visits on job_submissions;
create trigger job_submissions_thread_visits
  after update of status on job_submissions
  for each row when (old.status is distinct from new.status)
  execute function sq_thread_visits_on_job();

create or replace function sq_thread_visits_on_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sq_thread_visits_sweep(new.submission_id);
  return null;
end;
$$;
drop trigger if exists job_invitations_thread_visits on job_invitations;
create trigger job_invitations_thread_visits
  after update of status on job_invitations
  for each row when (old.status is distinct from new.status)
  execute function sq_thread_visits_on_invitation();

-- `revoke … from public` alone is a no-op here: default privileges grant
-- anon and authenticated directly, so they are named.
revoke execute on function sq_thread_visit_notify(uuid, text, text, text)  from public, anon, authenticated;
revoke execute on function sq_thread_visit_blocked(uuid, text)                   from public, anon, authenticated;
revoke execute on function sq_thread_visit_propose(uuid, text, text)       from public, anon, authenticated;
revoke execute on function sq_thread_visit_answer(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function sq_thread_visit_cancel(uuid, uuid, text)        from public, anon, authenticated;
revoke execute on function sq_thread_visits_sweep(uuid)                    from public, anon, authenticated;
revoke execute on function sq_thread_visits_on_job()                       from public, anon, authenticated;
revoke execute on function sq_thread_visits_on_invitation()                from public, anon, authenticated;
grant  execute on function sq_thread_visit_blocked(uuid, text)                   to service_role;
grant  execute on function sq_thread_visit_propose(uuid, text, text)       to service_role;
grant  execute on function sq_thread_visit_answer(uuid, uuid, text, boolean) to service_role;
grant  execute on function sq_thread_visit_cancel(uuid, uuid, text)        to service_role;
