-- Withdrawing a price, in one transaction (review of #267). Closing the
-- client_quotes row alone left the price standing everywhere else:
--  * contractor_quotes still unsuperseded and confirmed, so sq_quote_position
--    and sq_market_data counted it (rank, market median);
--  * the invitation still 'priced', so the contractor's page showed it as
--    standing, the Priced counts included it, and sq_direct_window_tick
--    treated the preferred contractor as having priced.
-- Now: client price closed + withdrawn_at, the contractor's quote superseded
-- by itself (no longer standing; a new price is a fresh one), the
-- invitation back to 'viewed' so they can price again, and the event logged
-- in the same transaction, so the log can't claim a withdrawal that didn't
-- happen.

create or replace function public.sq_withdraw_client_quote(
  p_submission_id uuid,
  p_client_quote_id uuid,
  p_actor_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cq client_quotes%rowtype;
  v_inv uuid;
begin
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_reason');
  end if;

  select * into v_cq from client_quotes
   where id = p_client_quote_id and submission_id = p_submission_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- An accepted price has a deposit behind it: that is a cancellation.
  if v_cq.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', v_cq.status);
  end if;

  update client_quotes
     set status = 'closed', withdrawn_at = now()
   where id = v_cq.id;

  update contractor_quotes
     set superseded_by = id
   where id = v_cq.contractor_quote_id and superseded_by is null
  returning invitation_id into v_inv;

  update job_invitations set status = 'viewed'
   where id = v_inv and status = 'priced';

  perform log_job_event(
    v_cq.submission_id, 'price_withdrawn', null, null, 'operator', p_actor_id, trim(p_reason),
    jsonb_build_object(
      'client_quote_id', v_cq.id,
      'contractor_id', v_cq.contractor_id,
      'client_price_pence', v_cq.client_price_pence
    )
  );

  return jsonb_build_object('ok', true);
end;
$function$;

-- Admin only, through the service role (see 20260922 PostgREST exposure:
-- anon/authenticated get EXECUTE by default privileges, so revoke by name).
revoke all on function public.sq_withdraw_client_quote(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.sq_withdraw_client_quote(uuid, uuid, uuid, text) to service_role;

-- CGS Ltd's price, withdrawn by hand before this existed: the same two
-- follow-on changes the function makes.
update public.contractor_quotes
   set superseded_by = id
 where id = '78a883da-42c0-4992-85cd-01fc0e193f1a'
   and superseded_by is null
   and exists (select 1 from public.client_quotes
                where contractor_quote_id = '78a883da-42c0-4992-85cd-01fc0e193f1a'
                  and withdrawn_at is not null);
update public.job_invitations
   set status = 'viewed'
 where id = '7d424f1f-6979-4502-868c-a06fcd3d96a3'
   and status = 'priced';
