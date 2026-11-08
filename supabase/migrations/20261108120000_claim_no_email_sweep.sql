-- contact_email is not proof of ownership. Two places treated it as if it were.
--
-- 1. Claiming a job no longer sweeps in other jobs by contact email.
--
-- The sweep attached every unclaimed job whose contact_email matched the
-- claimed job's. That email is whatever the submitter typed, and signup
-- autoconfirms, so it proved nothing: submit a job at /start with someone
-- else's address, sign up, and the claim of that job carried all of their
-- earlier unclaimed jobs — address, phone, prices, messages, accept/cancel/pay
-- — onto the stranger's account. Found 2026-11-08 (137 jobs exposed, no sign
-- it had been used: no job's contact_email differed from its owner's email).
--
-- Each job is now claimed only with its own token (the emailed /my/<token>
-- link or the thank-you-page cookie). Signature and return shape unchanged;
-- also_claimed is always 0.

create or replace function public.claim_submission_for_customer(p_token text, p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_js job_submissions%rowtype;
begin
  select * into v_js from job_submissions
   where client_token = p_token and client_token_revoked_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.customer_id is not null and v_js.customer_id <> p_customer_id then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update job_submissions set customer_id = p_customer_id where id = v_js.id;

  return jsonb_build_object('ok', true, 'also_claimed', 0);
end;
$function$;

-- create or replace keeps existing grants; restate that only the server
-- (service role) may call it.
revoke execute on function public.claim_submission_for_customer(text, uuid) from public, anon, authenticated;
grant  execute on function public.claim_submission_for_customer(text, uuid) to service_role;

-- 2. "Close my account" closes the account's own jobs, not every job under an
--    email.
--
-- deleteOwnAccount called sq_close_customer(email) for the login's email and
-- for every contact_email on the account's jobs. Neither is verified, and
-- sq_close_customer withdraws and scrubs every job with that email AND
-- deletes the login of every account that owns one. So: file a job at /start
-- with a stranger's address (or sign up as them, if they have no login),
-- close the account, and their jobs — and their own login — are gone.
--
-- sq_close_customer(email) stays for the admin "Close customer" button, where
-- a person has checked who is asking. This is the self-service version: same
-- scrub, keyed on customer_id, and it only ever removes the caller's row.

create or replace function public.sq_close_customer_account(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r           record;
  v_jobs      int := 0;
  v_withdrawn int := 0;
  v_photos    text[] := '{}';
begin
  if p_customer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_customer');
  end if;
  for r in
    select * from job_submissions where customer_id = p_customer_id for update
  loop
    if r.status in ('confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment') then
      perform sq_withdraw_job(r.id, 'account_closed');
      v_withdrawn := v_withdrawn + 1;
    end if;
    v_photos := v_photos || coalesce(r.photo_paths, '{}');
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
  delete from customers where id = p_customer_id;
  return jsonb_build_object('ok', true, 'jobs', v_jobs, 'withdrawn', v_withdrawn,
    'photo_paths', to_jsonb(v_photos));
end;
$function$;

revoke execute on function public.sq_close_customer_account(uuid) from public, anon, authenticated;
grant  execute on function public.sq_close_customer_account(uuid) to service_role;
