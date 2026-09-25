-- The one-open-proposal check in contractor_add_extra_work ran before any
-- lock: the source row is only locked inside sq_add_extra_work, so two
-- submits within the same instant (a double-tap, two tabs) both passed the
-- check and the customer got two priced jobs and two emails. Lock the source
-- row first; the second caller then waits and sees the first one's extra.

create or replace function contractor_add_extra_work(
  p_submission_id          uuid,
  p_contractor_id          uuid,
  p_description            text,
  p_contractor_price_pence int,
  p_price_basis            text,
  p_note_to_client         text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select awarded_contractor_id into v_owner
    from job_submissions where id = p_submission_id for update;
  if v_owner is null or v_owner is distinct from p_contractor_id then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  -- Any open extra on the job, whoever raised it: a second price on top of
  -- an unanswered one belongs with us, not in the customer's inbox.
  if exists (select 1 from job_submissions x
              where x.extra_work_of = p_submission_id
                and x.status in ('confirmed', 'distributed', 'quotes_receiving',
                                 'accepted_awaiting_payment')) then
    return jsonb_build_object('ok', false, 'reason', 'one_open_already');
  end if;
  return sq_add_extra_work(p_submission_id, p_description, p_contractor_price_pence,
    p_price_basis, p_note_to_client, 'contractor', 'contractor', p_contractor_id, null);
end;
$$;

revoke execute on function contractor_add_extra_work(uuid, uuid, text, int, text, text)
  from public, anon, authenticated;
grant execute on function contractor_add_extra_work(uuid, uuid, text, int, text, text) to service_role;
