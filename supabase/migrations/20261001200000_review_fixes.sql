-- ============================================================================
-- Review fixes for the visits, Priority Access and contact signals.
--
-- 1. A visit that has taken place is 'held', not 'accepted' forever: the
--    hourly tick marks it, and a new one can be arranged on the thread.
-- 2. A direct offer (a repeat, or HPM's first refusal) gets its shadow row
--    when the market actually opens, not when the one contractor was
--    offered it; rows written at the offer are rebuilt.
-- 3. Standing: a customer's refused words never count against the
--    contractor; a visit counts as contact only once it has happened; and
--    the visits watch rule needs the jobs to have gone quiet.
-- ============================================================================

-- ── 1. 'held' ───────────────────────────────────────────────────────────
alter table thread_visits drop constraint if exists thread_visits_status_check;
alter table thread_visits add constraint thread_visits_status_check
  check (status in ('proposed', 'accepted', 'held', 'declined', 'withdrawn', 'cancelled', 'lapsed'));

create or replace function sq_thread_visits_mark_held() returns int
language sql volatile security definer set search_path = public as $$
  with done as (
    update thread_visits set status = 'held'
     where status = 'accepted' and starts_at <= now()
    returning 1)
  select count(*)::int from done
$$;

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
  if v_at < now() + interval '2 hours' or v_at > now() + interval '2 months' then
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
    if v_open.status = 'accepted' and v_open.starts_at <= now() then
      -- It took place. Marked so, and the thread is free for another.
      update thread_visits set status = 'held' where id = v_open.id;
    elsif v_open.status = 'accepted' then
      return jsonb_build_object('ok', false, 'reason', 'already_agreed');
    end if;
    -- A new time replaces the one waiting for an answer, from either side.
    update thread_visits set status = 'withdrawn', decided_at = now()
     where id = v_open.id and status = 'proposed';
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


-- The hourly site-visit tick marks visits that have taken place.
create or replace function sq_visit_tick_and_held() returns jsonb
language sql volatile security definer set search_path = public as $$
  select sq_visit_tick() || jsonb_build_object('held', sq_thread_visits_mark_held())
$$;
do $$
begin
  perform cron.unschedule('site-visit-tick');
  perform cron.schedule('site-visit-tick', '37 * * * *', $c$select sq_visit_tick_and_held();$c$);
end $$;

-- ── 2. Direct offers: the window starts when the market sees it ─────────
-- Writes the row for one job: who, by today's standing (or the standing on
-- the day, when it exists), would have been in each window.
create or replace function sq_priority_shadow_open(p_submission_id uuid, p_backfill boolean default false)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js     job_submissions%rowtype;
  v_day    date;
  v_start  timestamptz;
  v_pri    uuid[];
  v_resp   uuid[];
  v_n      int;
  v_direct boolean;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  if not found or v_js.distributed_at is null then return; end if;
  v_direct := v_js.market_opens_at is not null or v_js.preferred_contractor_id is not null;
  -- Offered to one contractor and never put to the market: not a job the
  -- scheme would govern (first refusal sits above it), so no row.
  if v_direct and not exists (select 1 from job_events
                               where job_id = v_js.id and event_type = 'market_opened') then
    return;
  end if;
  -- A direct offer that opened to the market started its window then.
  v_start := coalesce(
    (select created_at from job_events where job_id = v_js.id and event_type = 'market_opened'
      order by created_at limit 1),
    case when v_js.market_opens_at is not null and v_js.market_opens_at <= now() then v_js.market_opens_at end,
    v_js.distributed_at);
  v_day := (v_start at time zone 'Europe/London')::date;

  select count(*),
         coalesce(array_agg(ji.contractor_id) filter (where t = 'priority'), '{}'),
         coalesce(array_agg(ji.contractor_id) filter (where t = 'responsive'), '{}')
    into v_n, v_pri, v_resp
    from job_invitations ji
    cross join lateral (select case when p_backfill
                                    then (select tier from contractor_standing_latest where contractor_id = ji.contractor_id)
                                    else sq_tier_on(ji.contractor_id, v_day) end) x(t)
   where ji.submission_id = v_js.id;

  insert into priority_shadow
    (submission_id, county_id, distributed_at, direct, backfilled, invited, priority_ids, responsive_ids,
     window_opens_at, market_opens_at)
  values
    (v_js.id, v_js.county_id, v_start, v_direct, p_backfill, v_n, v_pri, v_resp,
     v_start + make_interval(hours => app_config_num('sq_priority_window_hours', 24)::int),
     v_start + make_interval(hours => app_config_num('sq_responsive_window_hours', 48)::int))
  on conflict (submission_id) do nothing;
end;
$$;

create or replace function sq_priority_shadow_rebuild(p_submission_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  delete from priority_shadow where submission_id = p_submission_id;
  perform sq_priority_shadow_open(p_submission_id, false);
end;
$$;

create or replace function sq_priority_shadow_on_market_opened() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.event_type = 'market_opened' then
    perform sq_priority_shadow_rebuild(new.job_id);
  end if;
  return null;
end;
$$;
drop trigger if exists job_events_priority_shadow on job_events;
create trigger job_events_priority_shadow
  after insert on job_events
  for each row execute function sq_priority_shadow_on_market_opened();

-- The trigger on status fires at the direct offer too, when only one
-- invitation exists. Those rows are skipped: the market_opened event
-- rebuilds them with the full invitation list.
create or replace function sq_priority_shadow_on_distribute() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'distributed' and old.status is distinct from 'distributed'
     and new.market_opens_at is null then
    perform sq_priority_shadow_open(new.id, false);
  end if;
  return null;
end;
$$;

-- Rows written at the offer, or still waiting for the market: rebuilt.
do $$
declare r record;
begin
  for r in
    select p.submission_id from priority_shadow p
     where p.direct
       and exists (select 1 from job_events e where e.job_id = p.submission_id
                     and e.event_type = 'market_opened' and e.created_at > p.distributed_at)
  loop
    delete from priority_shadow where submission_id = r.submission_id;
    perform sq_priority_shadow_open(r.submission_id, true);
  end loop;
  -- A direct offer the market never saw is not the scheme's to judge.
  delete from priority_shadow p
   where p.direct and not exists (select 1 from job_events e
                                   where e.job_id = p.submission_id and e.event_type = 'market_opened');
end $$;

-- ── 3. Standing ─────────────────────────────────────────────────────────
create or replace function sq_standing_compute(p_on date default (now() at time zone 'Europe/London')::date)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r            record;
  v_won_days   int     := app_config_num('sq_priority_won_days', 180)::int;
  v_pr_min     int     := app_config_num('sq_priority_priced_min', 3)::int;
  v_pr_days    int     := app_config_num('sq_priority_priced_days', 60)::int;
  v_resp_h     numeric := app_config_num('sq_priority_response_hours', 24);
  v_clean_days int     := app_config_num('sq_priority_clean_days', 90)::int;
  v_w_contacts int     := app_config_num('sq_priority_watch_contacts', 3)::int;
  v_w_quiet    int     := app_config_num('sq_priority_watch_quiet', 2)::int;
  v_w_visits   int     := app_config_num('sq_priority_watch_visits', 2)::int;
  v_quiet_days int     := app_config_num('sq_priority_quiet_days', 14)::int;
  v_tier       text;
  v_clean      boolean;
  v_watch      boolean;
  v_reasons    text[];
  v_counts     jsonb := '{"priority":0,"responsive":0,"standard":0,"watch":0}';
begin
  for r in
    select ct.id,
      (select count(*) from job_submissions js
        where js.awarded_contractor_id = ct.id
          and js.awarded_at > p_on - v_won_days) as won,
      (select count(distinct cq.submission_id) from client_quotes cq
        where cq.contractor_id = ct.id
          and cq.created_at > p_on - v_pr_days) as priced,
      (select percentile_cont(0.5) within group (order by hrs)
         from (select (extract(epoch from min(cq.created_at) - ji.sent_at) / 3600)::numeric as hrs
                 from client_quotes cq
                 join job_invitations ji on ji.submission_id = cq.submission_id
                                        and ji.contractor_id = cq.contractor_id
                where cq.contractor_id = ct.id and cq.created_at > p_on - v_pr_days
                group by ji.id, ji.sent_at) t)::numeric as median_hours,
      -- Only their own words count against them, never a customer's.
      (select count(*) from platform_flags f
        where f.contractor_id = ct.id and f.sender = 'contractor'
          and f.created_at > p_on - v_clean_days) as flags,
      (select count(*) from job_messages m
         join job_invitations ji on ji.id = m.invitation_id
        where ji.contractor_id = ct.id and m.sender = 'contractor'
          and m.moderation = 'rejected' and m.moderated_at > p_on - v_clean_days) as rejected,
      (ct.messages_moderated_until > p_on - v_clean_days) as moderated,
      -- Contact before award, by job, with how the job ended.
      c.contacts, c.contact_won, c.contact_other, c.contact_quiet, c.visits, c.visits_quiet
    from contractors ct
    cross join lateral (
      select count(*) as contacts,
             count(*) filter (where o = 'won') as contact_won,
             count(*) filter (where o = 'other') as contact_other,
             count(*) filter (where o = 'quiet') as contact_quiet,
             count(*) filter (where visited) as visits,
             count(*) filter (where visited and o = 'quiet') as visits_quiet
        from (
          select j.submission_id, bool_or(j.visited) as visited,
                 sq_contact_outcome(j.submission_id, ct.id, v_quiet_days) as o
            from (
              select m.submission_id, false as visited
                from job_messages m join job_invitations ji on ji.id = m.invitation_id
               where ji.contractor_id = ct.id and m.sender = 'contractor' and m.phase = 'pre_award'
                 and coalesce(m.moderation, 'approved') <> 'rejected'
                 and m.created_at > p_on - v_clean_days
              union all
              select v.submission_id, true
                from thread_visits v join job_invitations ji on ji.id = v.invitation_id
               where ji.contractor_id = ct.id
                 and v.starts_at > p_on - v_clean_days
                 -- A visit that took place: agreed and the time has passed
                 -- ('held' once the tick has marked it, 'accepted' until then).
                 -- One still to come, or called off before it happened, is
                 -- not contact.
                 and ((v.status in ('accepted', 'held') and v.starts_at < now())
                      or (v.status = 'cancelled' and v.starts_at < v.decided_at))
            ) j
           group by j.submission_id
        ) per_job
    ) c
    where ct.status = 'approved' and ct.vetted_at is not null
  loop
    v_clean := r.flags = 0 and r.rejected = 0 and not coalesce(r.moderated, false);
    -- Visits only count once their job has gone quiet: a visit on a job
    -- the customer is still deciding is the behaviour the scheme wants.
    v_watch := (r.contacts >= v_w_contacts and r.contact_won = 0 and r.contact_quiet >= v_w_quiet)
            or (r.visits_quiet >= v_w_visits and r.contact_won = 0);
    v_reasons := '{}';
    if r.flags > 0 then v_reasons := v_reasons || format('%s refused message(s) or note(s) in %s days', r.flags, v_clean_days); end if;
    if r.rejected > 0 then v_reasons := v_reasons || format('%s message(s) removed by a moderator', r.rejected); end if;
    if coalesce(r.moderated, false) then v_reasons := v_reasons || 'messages under moderation'::text; end if;
    if v_watch then
      v_reasons := v_reasons || format('watch: %s customer(s) contacted%s, none booked with them, %s went quiet',
        r.contacts,
        case when r.visits > 0 then format(' (%s site visit(s))', r.visits) else '' end,
        r.contact_quiet);
    end if;

    if v_clean and not v_watch and r.won >= 1 then
      v_tier := 'priority';
      v_reasons := v_reasons || format('booked %s job(s) through the platform in %s days', r.won, v_won_days);
    elsif v_clean and not v_watch and r.priced >= v_pr_min and r.median_hours is not null and r.median_hours <= v_resp_h then
      v_tier := 'responsive';
      v_reasons := v_reasons || format('priced %s jobs in %s days, median %sh to price', r.priced, v_pr_days, round(r.median_hours, 1));
    else
      v_tier := 'standard';
      if v_clean and not v_watch then
        if r.won = 0 and r.priced < v_pr_min then
          v_reasons := v_reasons || format('priced %s of the %s needed in %s days', r.priced, v_pr_min, v_pr_days);
        elsif r.won = 0 then
          v_reasons := v_reasons || format('median %sh to price, over the %sh needed', round(coalesce(r.median_hours, 0), 1), v_resp_h);
        end if;
      elsif not v_clean then
        v_reasons := v_reasons || 'standing lost until the record is clean'::text;
      else
        v_reasons := v_reasons || 'standing held at Standard while on watch'::text;
      end if;
    end if;

    insert into contractor_standing
      (contractor_id, computed_on, tier, won, priced, median_hours, flags, rejected_msgs, moderated, clean, reasons,
       contacts, contact_won, contact_other, contact_quiet, visits, visits_quiet, watch)
    values
      (r.id, p_on, v_tier, r.won, r.priced, round(r.median_hours, 1), r.flags, r.rejected, coalesce(r.moderated, false), v_clean, v_reasons,
       r.contacts, r.contact_won, r.contact_other, r.contact_quiet, r.visits, r.visits_quiet, v_watch)
    on conflict (contractor_id, computed_on) do update
      set tier = excluded.tier, won = excluded.won, priced = excluded.priced,
          median_hours = excluded.median_hours, flags = excluded.flags,
          rejected_msgs = excluded.rejected_msgs, moderated = excluded.moderated,
          clean = excluded.clean, reasons = excluded.reasons,
          contacts = excluded.contacts, contact_won = excluded.contact_won, contact_other = excluded.contact_other,
          contact_quiet = excluded.contact_quiet, visits = excluded.visits, visits_quiet = excluded.visits_quiet,
          watch = excluded.watch, computed_at = now();
    v_counts := jsonb_set(v_counts, array[v_tier], to_jsonb((v_counts->>v_tier)::int + 1));
    if v_watch then v_counts := jsonb_set(v_counts, '{watch}', to_jsonb((v_counts->>'watch')::int + 1)); end if;
  end loop;
  return v_counts;
end;
$$;


revoke execute on function sq_priority_shadow_open(uuid, boolean)   from public, anon, authenticated;
revoke execute on function sq_thread_visits_mark_held()          from public, anon, authenticated;
revoke execute on function sq_visit_tick_and_held()              from public, anon, authenticated;
revoke execute on function sq_priority_shadow_rebuild(uuid)      from public, anon, authenticated;
revoke execute on function sq_priority_shadow_on_market_opened() from public, anon, authenticated;
grant  execute on function sq_visit_tick_and_held()              to service_role;

select sq_thread_visits_mark_held();
select sq_standing_compute();
select sq_priority_shadow_tick();
