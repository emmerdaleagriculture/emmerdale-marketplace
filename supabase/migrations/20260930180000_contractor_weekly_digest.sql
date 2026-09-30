-- ============================================================================
-- "Jobs near you this week": a Monday round-up for contractors.
--
-- A contractor hears about a job twice at most — the invitation, and one
-- reminder a day later — and after that an unpriced job is out of sight,
-- though it may stay open for weeks. Of 250 approved contractors, 59 priced
-- anything in the 30 days to 30 Sep 2026. This is the cheap alternative to a
-- contractor forum: once a week, everything they could still price, and what
-- came in across their counties.
--
--   * Waiting for your price: their invitations still open that they haven't
--     priced or passed on, soonest-closing first, each with its link.
--   * In your counties: new jobs this week, and jobs open nationally.
--
-- Nothing to say → no email. Respects notify_new_jobs and the test
-- allowlist, like the reminder. Once per contractor per week
-- (contractor_digests). Off until app_config sq_weekly_digest_enabled = 1;
-- sq_weekly_digest_preview sends one contractor's email to the admin first.
-- ============================================================================

create table if not exists contractor_digests (
  contractor_id uuid not null references contractors(id) on delete cascade,
  week_of       date not null,
  sent_at       timestamptz not null default now(),
  open_jobs     int not null,
  area_new      int not null,
  primary key (contractor_id, week_of)
);
alter table contractor_digests enable row level security;
revoke all on contractor_digests from public, anon, authenticated;
grant all on contractor_digests to service_role;

insert into app_config (key, value) values ('sq_weekly_digest_enabled', '0')
on conflict (key) do nothing;

-- One contractor's round-up, or null when there is nothing to tell them.
create or replace function sq_weekly_digest_payload(p_contractor_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ct        contractors%rowtype;
  v_jobs      jsonb;
  v_open      int;
  v_area_new  int;
  v_counties  text[];
  v_national  int;
begin
  select * into v_ct from contractors where id = p_contractor_id;
  if not found then return null; end if;

  select coalesce(jsonb_agg(j order by j->>'expires_at'), '[]'::jsonb), count(*)
    into v_jobs, v_open
    from (
      select jsonb_build_object(
               'service', sq_service_label(js.service_id, js.service_verbatim),
               'postcode_district', split_part(js.postcode, ' ', 1),
               'county', c.name,
               'acres', coalesce(js.area_mapped_value,
                                 case js.area_unit when 'acres' then js.area_value
                                                   when 'hectares' then round(js.area_value * 2.47105, 1) end),
               'distance_miles', ji.distance_miles,
               'expires_at', js.expires_at,
               'prices_so_far', (select count(distinct q.contractor_id) from contractor_quotes q
                                  where q.submission_id = js.id and q.confirmed_by_contractor),
               'token', ji.token) as j
        from job_invitations ji
        join job_submissions js on js.id = ji.submission_id
        left join counties c on c.id = js.county_id
       where ji.contractor_id = p_contractor_id
         and ji.status in ('sent', 'viewed')
         and js.status in ('distributed', 'quotes_receiving')
         and js.hidden_at is null
         and js.expires_at > now() + interval '12 hours'
         and sq_in_invite_range(js.lat, js.lng, v_ct.base_lat, v_ct.base_lng, v_ct.invite_radius_miles)
       order by js.expires_at
       limit 10
    ) t;

  select count(*) into v_area_new
    from job_submissions js
   where js.county_id in (select county_id from contractor_counties where contractor_id = p_contractor_id)
     and js.distributed_at > now() - interval '7 days'
     and js.hidden_at is null;

  select array_agg(name order by name) into v_counties
    from (select c.name from contractor_counties cc join counties c on c.id = cc.county_id
           where cc.contractor_id = p_contractor_id order by c.name limit 4) x;

  select count(*) into v_national from job_submissions
   where status in ('distributed', 'quotes_receiving') and hidden_at is null and expires_at > now();

  if v_open = 0 and v_area_new = 0 then return null; end if;

  return jsonb_build_object(
    'business_name', v_ct.business_name,
    'contact_name', v_ct.contact_name,
    'jobs', v_jobs,
    'open_count', v_open,
    'area_new', v_area_new,
    'counties', to_jsonb(coalesce(v_counties, '{}')),
    'county_count', (select count(*) from contractor_counties where contractor_id = p_contractor_id),
    'national_open', v_national);
end;
$$;

-- Monday: everyone with something to see, once each per week.
create or replace function sq_weekly_digest_tick() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r           record;
  v_payload   jsonb;
  v_week      date := date_trunc('week', now() at time zone 'Europe/London')::date;
  v_allowlist jsonb;
  v_sent      int := 0;
  v_skipped   int := 0;
begin
  if app_config_num('sq_weekly_digest_enabled', 0) <> 1 then
    return jsonb_build_object('enabled', false);
  end if;
  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  for r in
    select ct.id, ct.email from contractors ct
     where ct.status = 'approved' and ct.vetted_at is not null and ct.notify_new_jobs
       and ct.email is not null
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
       and not exists (select 1 from contractor_digests d where d.contractor_id = ct.id and d.week_of = v_week)
  loop
    v_payload := sq_weekly_digest_payload(r.id);
    if v_payload is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into pending_emails (kind, to_email, payload) values ('sq_weekly_digest', r.email, v_payload);
    insert into contractor_digests (contractor_id, week_of, open_jobs, area_new)
    values (r.id, v_week, (v_payload->>'open_count')::int, (v_payload->>'area_new')::int);
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('sent', v_sent, 'nothing_to_say', v_skipped);
end;
$$;

-- One contractor's email, to the admin, marked as a preview. Sends nothing
-- to the contractor and records nothing against their week.
create or replace function sq_weekly_digest_preview(p_contractor_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_payload jsonb := sq_weekly_digest_payload(p_contractor_id);
begin
  if v_payload is null then return jsonb_build_object('ok', false, 'reason', 'nothing_to_say'); end if;
  insert into pending_emails (kind, to_email, payload)
  values ('sq_weekly_digest', '__admin__', v_payload || jsonb_build_object('preview', true));
  return jsonb_build_object('ok', true, 'jobs', v_payload->'open_count', 'area_new', v_payload->'area_new');
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-digest') then
    perform cron.unschedule('weekly-digest');
  end if;
  -- 06:30 UTC Mondays: 07:30 in summer, 06:30 in winter — before the day starts.
  perform cron.schedule('weekly-digest', '30 6 * * 1', $c$select sq_weekly_digest_tick();$c$);
end $$;

revoke execute on function sq_weekly_digest_payload(uuid) from public, anon, authenticated;
revoke execute on function sq_weekly_digest_tick()        from public, anon, authenticated;
revoke execute on function sq_weekly_digest_preview(uuid) from public, anon, authenticated;
grant  execute on function sq_weekly_digest_payload(uuid) to service_role;
grant  execute on function sq_weekly_digest_tick()        to service_role;
grant  execute on function sq_weekly_digest_preview(uuid) to service_role;
