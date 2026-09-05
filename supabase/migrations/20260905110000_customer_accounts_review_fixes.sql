-- ============================================================================
-- Review fixes for the customer account tables.
--
-- The serious one: job_schedules_update_own was `using (customer_id =
-- auth.uid())` with no `with check` and no column restriction, so a signed-in
-- user could PATCH their own schedule row through PostgREST and point
-- source_submission_id at ANY submission id. Contractors are handed submission
-- ids by my_sq_invitations (deliberately, with contact details withheld until
-- award), and a contractor may also be a customer. run_due_job_schedules would
-- then clone that job — contact_name, contact_phone, contact_email, the full
-- postcode, lat/lng, gate_w3w — set customer_id to the attacker and mint them a
-- client_token, which /my/<token> renders in full. It would also re-distribute
-- someone else's job and email them a portal link they didn't ask for.
--
-- Both UPDATE policies go. Nothing needs them: every write already runs through
-- a service-role action that re-checks ownership.
-- ============================================================================

drop policy if exists job_schedules_update_own on job_schedules;
drop policy if exists customers_update_own on customers;

-- Re-runnable, so a partially applied push can be retried (the originals were
-- bare CREATE POLICY and would abort on replay).
drop policy if exists customers_select_own on customers;
create policy customers_select_own on customers for select using (id = auth.uid());
drop policy if exists job_schedules_select_own on job_schedules;
create policy job_schedules_select_own on job_schedules for select using (customer_id = auth.uid());

-- One active repeat per job. Two tabs or a double tap made two, both fired
-- every cycle, and /my keyed its map on source_submission_id so only the last
-- was rendered — the other kept sending with nothing in the UI to stop it.
create unique index if not exists job_schedules_one_active_per_job
  on job_schedules (source_submission_id) where active;

-- Deleting an auth user cascaded into customers and then hit this FK, aborting
-- the delete with an error naming a table the operator wasn't touching.
alter table job_submissions drop constraint if exists job_submissions_customer_id_fkey;
alter table job_submissions
  add constraint job_submissions_customer_id_fkey
  foreign key (customer_id) references customers(id) on delete set null;

-- A claim swept in every unclaimed row at that email whatever its state, so
-- abandoned drafts arrived as cards headed "draft" and inflated the count the
-- customer was shown.
create or replace function claim_submission_for_customer(p_token text, p_customer_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js   job_submissions%rowtype;
  v_also int := 0;
begin
  select * into v_js from job_submissions
   where client_token = p_token and client_token_revoked_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.customer_id is not null and v_js.customer_id <> p_customer_id then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update job_submissions set customer_id = p_customer_id where id = v_js.id;

  if v_js.contact_email is not null then
    update job_submissions
       set customer_id = p_customer_id
     where customer_id is null
       and lower(contact_email) = lower(v_js.contact_email)
       and status not in ('draft', 'abandoned');
    get diagnostics v_also = row_count;
  end if;

  return jsonb_build_object('ok', true, 'also_claimed', v_also);
end;
$$;

revoke execute on function claim_submission_for_customer(text, uuid) from public, anon, authenticated;
grant execute on function claim_submission_for_customer(text, uuid) to service_role;

-- One poisoned schedule used to abort the whole run: every earlier clone and
-- every next_run_at advance rolled back, and the hourly cron replayed the same
-- failure forever while everyone else's repeat starved behind it.
create or replace function run_due_job_schedules() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  r      record;
  v_new  uuid;
  v_done int := 0;
begin
  for r in
    select s.*, js.id as src
      from job_schedules s
      join job_submissions js on js.id = s.source_submission_id
     where s.active and s.next_run_at <= now()
     for update of s skip locked
  loop
    begin
      insert into job_submissions (
        status, confirmed_at, customer_id, client_token,
        raw_text, location_raw, service_id, service_verbatim, service_confirmed,
        area_value, area_unit, area_source, area_mapped_value, boundary,
        postcode, lat, lng, county_id,
        urgency, target_date, access_notes, obstacles, service_attributes,
        gate_w3w, gate_width, photo_paths,
        contact_name, contact_phone, contact_email, contact_preference
      )
      select
        'confirmed', now(), r.customer_id, sq_token(),
        raw_text, location_raw, service_id, service_verbatim, service_confirmed,
        area_value, area_unit, area_source, area_mapped_value, boundary,
        postcode, lat, lng, county_id,
        urgency, null, access_notes, obstacles, service_attributes,
        gate_w3w, gate_width, photo_paths,
        contact_name, contact_phone, contact_email, contact_preference
        from job_submissions where id = r.src
      returning id into v_new;

      perform log_job_event(v_new, 'status_change', null, 'confirmed', 'system', null,
        'repeat schedule', jsonb_build_object('schedule_id', r.id, 'source', r.src));
      perform distribute_submission(v_new);
      v_done := v_done + 1;
    exception when others then
      -- Advance it anyway: a schedule that cannot run must not block the queue,
      -- and retrying the identical clone every hour would only repeat the fault.
      raise warning 'job schedule % failed: %', r.id, sqlerrm;
    end;

    update job_schedules
       set last_run_at = now(),
           runs = runs + 1,
           next_run_at = now() + make_interval(months => r.interval_months)
     where id = r.id;
  end loop;
  return v_done;
end;
$$;

revoke execute on function run_due_job_schedules() from public, anon, authenticated;
grant execute on function run_due_job_schedules() to service_role;
