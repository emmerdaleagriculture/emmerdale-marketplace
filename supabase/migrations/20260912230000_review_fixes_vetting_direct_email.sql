-- ============================================================================
-- Review fixes for 20260912170000 and 20260912220000.
--
-- 1) contractors_stamp_vetted fired on any UPDATE naming `status`, including
--    one that left it unchanged — which the guard allows a contractor to send
--    for their own row. An approved-but-unvetted contractor could therefore
--    stamp vetted_at on themselves by re-saving status = 'approved'. Stamp only
--    when status actually changes (or on insert).
--
-- 2) A repeat offered to one contractor ("the customer asked for you again")
--    was silently not emailed when that contractor had turned job emails off,
--    so they never heard and the customer waited out the whole 48 hours. That
--    is a personal request, not a new-job alert: it is always emailed. Market
--    invitations still respect notify_new_jobs.
-- ============================================================================

create or replace function contractors_stamp_vetted()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and new.vetted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.vetted_at := now();
  end if;
  return new;
end;
$$;

create or replace function sq_invite_contractor(
  p_submission_id uuid, p_contractor_id uuid, p_extra jsonb default '{}'::jsonb
) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js  job_submissions%rowtype;
  v_ct  contractors%rowtype;
  v_inv job_invitations%rowtype;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  select * into v_ct from contractors where id = p_contractor_id;
  if v_js.id is null or v_ct.id is null then return false; end if;

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
$$;

revoke execute on function sq_invite_contractor(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function sq_invite_contractor(uuid, uuid, jsonb) to service_role;
