-- Claiming a job no longer sweeps in other jobs by contact email.
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
