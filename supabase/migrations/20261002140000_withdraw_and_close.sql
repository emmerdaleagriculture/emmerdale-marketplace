-- ============================================================================
-- A customer can withdraw an open job, and close their account.
--
-- Until now a customer whose job was out for prices had no way to take it
-- back: it sat at "prices coming in" until it expired, with contractors
-- still pricing and messaging into it, and the only route was an email to
-- us (Samantha, 2 Oct 2026: "all been done off this site"). Withdrawing
-- asks why first. "Booked one of these contractors directly" is the first
-- hard evidence of work leaving the platform we have ever been able to
-- record, so it is kept as a platform_flag against that contractor and
-- counts against their standing.
--
-- Closing an account withdraws every open job and scrubs the customer's
-- name, phone, email, access notes, photos and messages from all of them;
-- the jobs themselves stay (prices, events, the split-test arm) so the
-- numbers do not change under us. The login is deleted by the app.
-- ============================================================================

alter table platform_flags drop constraint if exists platform_flags_rule_check;
alter table platform_flags add constraint platform_flags_rule_check
  check (rule in ('off_platform', 'phone', 'email_or_link', 'postcode', 'booked_direct'));

-- ── Withdraw ────────────────────────────────────────────────────────────
-- p_reason: done_elsewhere | booked_direct | not_needed | other | account_closed.
-- p_contractor_id: with booked_direct, who; must have been invited to the job.
create or replace function sq_withdraw_job(
  p_submission_id uuid, p_reason text, p_contractor_id uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js   job_submissions%rowtype;
  v_ct   contractors%rowtype;
  r      record;
  v_told int := 0;
begin
  if p_reason not in ('done_elsewhere', 'booked_direct', 'not_needed', 'other', 'account_closed') then
    return jsonb_build_object('ok', false, 'reason', 'bad_reason');
  end if;
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status not in ('confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment') then
    return jsonb_build_object('ok', false, 'reason', 'not_open', 'status', v_js.status);
  end if;
  if p_reason = 'booked_direct' and p_contractor_id is not null then
    if not exists (select 1 from job_invitations
                    where submission_id = v_js.id and contractor_id = p_contractor_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_invited');
    end if;
    select * into v_ct from contractors where id = p_contractor_id;
  end if;

  -- Everyone with a live price is told, before the prices close.
  for r in
    select distinct ji.contractor_id, ji.token, ct.email
      from client_quotes q
      join job_invitations ji on ji.submission_id = q.submission_id and ji.contractor_id = q.contractor_id
      join contractors ct on ct.id = ji.contractor_id
     where q.submission_id = v_js.id and q.status = 'active' and ct.email is not null
  loop
    if sq_notify_once(v_js.id, r.contractor_id::text || ':withdrawn', 'sq_job_withdrawn', r.email,
         jsonb_build_object('service', sq_service_label(v_js.service_id, v_js.service_verbatim),
                            'postcode_district', split_part(v_js.postcode, ' ', 1),
                            'token', r.token)) then
      v_told := v_told + 1;
    end if;
  end loop;

  update job_invitations set status = 'closed_stale'
   where submission_id = v_js.id and status in ('sent', 'viewed', 'priced');
  update client_quotes set status = 'closed'
   where submission_id = v_js.id and status in ('active', 'accepted');
  update job_submissions set status = 'cancelled' where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'cancelled', 'client', null,
    'withdrawn by the customer: ' || p_reason
      || case when v_ct.id is not null then ' (' || v_ct.business_name || ')' else '' end,
    jsonb_build_object('reason', p_reason, 'contractor_id', p_contractor_id, 'contractors_told', v_told));

  if p_reason = 'booked_direct' and v_ct.id is not null then
    insert into platform_flags (submission_id, contractor_id, sender, surface, rule)
    values (v_js.id, v_ct.id, 'customer', 'withdrawal', 'booked_direct');
    insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
      jsonb_build_object(
        'subject', 'Customer says they booked ' || coalesce(v_ct.business_name, 'a contractor') || ' directly',
        'text', 'Withdrawing job ' || v_js.id || ', the customer said they booked '
          || coalesce(v_ct.business_name, 'a contractor') || ' directly, off the platform. '
          || E'It is recorded against their standing.\n\n'
          || coalesce(nullif(current_setting('app.site_url', true), ''), 'https://www.emmerdaleagriculture.com')
          || '/admin/contractors/' || v_ct.id));
  end if;
  return jsonb_build_object('ok', true, 'contractors_told', v_told);
end;
$$;

-- ── Close the account ───────────────────────────────────────────────────
-- Every job under this email: open ones withdrawn, all of them scrubbed.
-- Returns what the app has to finish: photos to delete from storage and
-- auth users to delete.
create or replace function sq_close_customer(p_email text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r          record;
  v_jobs     int := 0;
  v_withdrawn int := 0;
  v_photos   text[] := '{}';
  v_users    uuid[] := '{}';
begin
  if coalesce(btrim(p_email), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_email');
  end if;
  for r in
    select * from job_submissions where lower(contact_email) = lower(btrim(p_email)) for update
  loop
    if r.status in ('confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment') then
      perform sq_withdraw_job(r.id, 'account_closed');
      v_withdrawn := v_withdrawn + 1;
    end if;
    v_photos := v_photos || coalesce(r.photo_paths, '{}');
    if r.customer_id is not null and not (r.customer_id = any (v_users)) then
      v_users := v_users || r.customer_id;
    end if;
    delete from job_messages where submission_id = r.id and sender = 'client';
    update job_submissions
       set contact_name = 'Removed',
           contact_phone = null,
           contact_email = 'removed+' || left(r.id::text, 8) || '@emmerdaleagriculture.invalid',
           access_notes = null,
           photo_paths = '{}',
           client_token_revoked_at = coalesce(client_token_revoked_at, now())
     where id = r.id;
    perform log_job_event(r.id, 'status_change', null, null, 'client', null,
      'account closed at the customer''s request; details removed', '{}');
    v_jobs := v_jobs + 1;
  end loop;
  delete from customers where id = any (v_users);
  return jsonb_build_object('ok', true, 'jobs', v_jobs, 'withdrawn', v_withdrawn,
    'photo_paths', to_jsonb(v_photos), 'user_ids', to_jsonb(v_users));
end;
$$;

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
      -- Only their own words count against them, never a customer's — except
      -- a customer saying they booked this contractor directly, which is the
      -- one report that is about the contractor.
      (select count(*) from platform_flags f
        where f.contractor_id = ct.id
          and (f.sender = 'contractor' or f.rule = 'booked_direct')
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



revoke execute on function sq_withdraw_job(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function sq_close_customer(text)          from public, anon, authenticated;
grant  execute on function sq_withdraw_job(uuid, text, uuid) to service_role;
grant  execute on function sq_close_customer(text)          to service_role;
