-- ============================================================================
-- Standing: contact that doesn't become a booking.
--
-- A contractor who messages customers often, or gets site visits agreed,
-- and then books little through the platform, is the shape of someone
-- taking the work elsewhere. Not proof — the customer may simply not have
-- gone ahead — so it is scored against the job's own ending: a job that
-- was booked with another contractor exonerates the contact; a job that
-- went quiet does not.
--
-- Over the clean window, per contractor:
--   contacts       jobs where they messaged before award, or had a visit agreed
--   contact_won    of those, booked with them
--   contact_other  booked with someone else through us
--   contact_quiet  ended with nobody booked (expired, cancelled, or priced
--                  and silent for sq_priority_quiet_days)
--   visits         visits agreed; visits_quiet those whose job went quiet
--
-- "Watch" when contacts >= sq_priority_watch_contacts with none won and
-- contact_quiet >= sq_priority_watch_quiet, or visits >= sq_priority_watch_visits
-- with none won. Watch caps the standing at Standard and names the reason;
-- the admin page lists them for a person to look at.
-- ============================================================================

insert into app_config (key, value) values
  ('sq_priority_watch_contacts', '3'),
  ('sq_priority_watch_quiet',    '2'),
  ('sq_priority_watch_visits',   '2'),
  ('sq_priority_quiet_days',     '14')
on conflict (key) do nothing;

alter table contractor_standing
  add column if not exists contacts      int not null default 0,
  add column if not exists contact_won   int not null default 0,
  add column if not exists contact_other int not null default 0,
  add column if not exists contact_quiet int not null default 0,
  add column if not exists visits        int not null default 0,
  add column if not exists visits_quiet  int not null default 0,
  add column if not exists watch         boolean not null default false;

-- The view carries every column; re-created so the new ones are in it.
drop view if exists contractor_standing_latest;
create view contractor_standing_latest as
  select distinct on (contractor_id) *
    from contractor_standing
   order by contractor_id, computed_on desc;
revoke all on contractor_standing_latest from public, anon, authenticated;
grant select on contractor_standing_latest to service_role;

-- How a job ended, for this purpose: 'won' (by this contractor), 'other',
-- 'quiet', or null while it is still live.
create or replace function sq_contact_outcome(p_submission_id uuid, p_contractor_id uuid, p_quiet_days int)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when js.awarded_contractor_id = p_contractor_id then 'won'
    when js.awarded_contractor_id is not null then 'other'
    when js.status in ('expired', 'no_quotes', 'cancelled') then 'quiet'
    when js.status in ('distributed', 'quotes_receiving')
     and greatest(coalesce(js.distributed_at, js.created_at),
                  coalesce((select max(created_at) from client_quotes q where q.submission_id = js.id), js.created_at),
                  coalesce((select max(created_at) from job_messages m where m.submission_id = js.id), js.created_at))
         < now() - make_interval(days => p_quiet_days)
      then 'quiet'
  end
  from job_submissions js where js.id = p_submission_id
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
      (select count(*) from platform_flags f
        where f.contractor_id = ct.id and f.created_at > p_on - v_clean_days) as flags,
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
               where ji.contractor_id = ct.id and v.status in ('accepted', 'cancelled')
                 and v.decided_at > p_on - v_clean_days
                 -- A visit called off before it happened is not contact.
                 and (v.status = 'accepted' or v.starts_at < v.decided_at)
            ) j
           group by j.submission_id
        ) per_job
    ) c
    where ct.status = 'approved' and ct.vetted_at is not null
  loop
    v_clean := r.flags = 0 and r.rejected = 0 and not coalesce(r.moderated, false);
    v_watch := (r.contacts >= v_w_contacts and r.contact_won = 0 and r.contact_quiet >= v_w_quiet)
            or (r.visits >= v_w_visits and r.contact_won = 0);
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

revoke execute on function sq_contact_outcome(uuid, uuid, int) from public, anon, authenticated;

-- Re-score today with the new signals in.
select sq_standing_compute();
