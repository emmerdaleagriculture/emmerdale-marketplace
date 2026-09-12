-- ============================================================================
-- New contractors see the jobs already open in their area.
--
-- distribute_submission fans a job out once, at confirmation, to whoever is
-- approved, vetted and covering the county at that moment. A contractor
-- approved an hour later — or one who adds a county — never heard about any
-- of the jobs still open there, for up to 7 days.
--
-- 1) Approval vets. Nothing in the app ever set vetted_at after the one-off
--    backfill in 20260901100001, so every contractor approved since was
--    silently excluded from distribution. Approving now stamps it, and the
--    approved-but-unvetted backlog is stamped here.
--
-- 2) invite_contractor_to_open_jobs(contractor, county?) invites an eligible
--    contractor to every open submission (distributed / quotes_receiving) in
--    their counties with at least sq_late_invite_min_hours left to run. Same
--    rows and email as distribute_submission, flagged late_join so the email
--    gives the real closing date instead of "7 days". Idempotent on
--    job_invitations (submission_id, contractor_id) and submission_notifications.
--
-- 3) It fires when a contractor becomes eligible (approved + vetted, including
--    reinstatement) and when a county is added to their coverage. A failure is
--    downgraded to a warning: approving someone or saving a profile must never
--    fail because of a backfill.
--
-- The guard trigger also stops contractors vetting themselves: vetted_at was
-- writable through contractors_update_own.
-- ============================================================================

insert into app_config (key, value) values ('sq_late_invite_min_hours', '12')
on conflict (key) do nothing;

-- ── Guard: vetted_at is admin-only too ─────────────────────────────────────
create or replace function guard_contractor_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'contractor status can only be changed by an admin';
  end if;
  if new.vetted_at is distinct from old.vetted_at and current_user in ('authenticated', 'anon') then
    raise exception 'contractor vetting can only be changed by an admin';
  end if;
  return new;
end;
$$;

-- ── Approval stamps vetted_at ───────────────────────────────────────────────
-- Runs after contractors_guard (triggers fire in name order).
create or replace function contractors_stamp_vetted()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and new.vetted_at is null then
    new.vetted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists contractors_stamp_vetted on contractors;
create trigger contractors_stamp_vetted
  before insert or update of status on contractors
  for each row execute function contractors_stamp_vetted();

-- ── The late invite ─────────────────────────────────────────────────────────
create or replace function invite_contractor_to_open_jobs(
  p_contractor_id uuid, p_county_id int default null
) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_ct contractors%rowtype;
  v_allowlist jsonb;
  v_js record;
  v_inv job_invitations%rowtype;
  v_invited int := 0;
begin
  select * into v_ct from contractors where id = p_contractor_id;
  if not found or v_ct.status <> 'approved' or v_ct.vetted_at is null then
    return 0;
  end if;

  -- Test mode: same filter as distribute_submission.
  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);
  if jsonb_array_length(v_allowlist) > 0
     and v_ct.email not in (select jsonb_array_elements_text(v_allowlist)) then
    return 0;
  end if;

  for v_js in
    select js.id, js.lat, js.lng
      from job_submissions js
      join contractor_counties cc
        on cc.county_id = js.county_id and cc.contractor_id = v_ct.id
     where js.status in ('distributed', 'quotes_receiving')
       and js.expires_at > now() + make_interval(hours => app_config_num('sq_late_invite_min_hours', 12)::int)
       and (p_county_id is null or js.county_id = p_county_id)
     order by js.expires_at
       for share of js skip locked
  loop
    insert into job_invitations (submission_id, contractor_id, token, distance_miles)
    values (v_js.id, v_ct.id, sq_token(),
            round(haversine_miles(v_js.lat, v_js.lng, v_ct.base_lat, v_ct.base_lng), 1))
    on conflict (submission_id, contractor_id) do nothing
    returning * into v_inv;
    if found then
      v_invited := v_invited + 1;
      insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
      values (v_inv.id, v_ct.id, 'sent', jsonb_build_object('late_join', true));
      perform sq_notify_once(v_js.id, v_ct.id::text, 'sq_invitation', v_ct.email,
        sq_job_facts(v_js.id) || jsonb_build_object(
          'token', v_inv.token,
          'distance_miles', v_inv.distance_miles,
          'late_join', true));
    end if;
  end loop;

  return v_invited;
end;
$$;

revoke execute on function invite_contractor_to_open_jobs(uuid, int) from public;
grant execute on function invite_contractor_to_open_jobs(uuid, int) to service_role;

-- ── Triggers ────────────────────────────────────────────────────────────────
create or replace function contractors_invite_on_eligible()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_table_name = 'contractor_counties' then
      perform invite_contractor_to_open_jobs(new.contractor_id, new.county_id);
    else
      perform invite_contractor_to_open_jobs(new.id);
    end if;
  exception when others then
    raise warning 'late invite failed for %: %', tg_table_name, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists contractors_invite_on_eligible on contractors;
create trigger contractors_invite_on_eligible
  after update of status, vetted_at on contractors
  for each row
  when (new.status = 'approved' and new.vetted_at is not null
        and (old.status is distinct from 'approved' or old.vetted_at is null))
  execute function contractors_invite_on_eligible();

drop trigger if exists contractor_counties_invite on contractor_counties;
create trigger contractor_counties_invite
  after insert on contractor_counties
  for each row execute function contractors_invite_on_eligible();

-- ── Backlog: approved since the 20260901 backfill, never vetted ─────────────
-- Fires contractors_invite_on_eligible for each, so they get today's open jobs.
update contractors set vetted_at = now()
 where status = 'approved' and vetted_at is null;
