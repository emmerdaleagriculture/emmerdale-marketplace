-- Every job email opens with "Re: <the job>" (2026-10-09).
--
-- A customer with two jobs on the go, or a contractor pricing five, gets
-- emails whose subject names the job in a dozen different shapes and whose
-- body often doesn't name it at all ("The customer accepted your price…").
-- Tom asked for one reference line, the way a letter has one, built from the
-- job's title.
--
-- The title is computed once, here, so every sender agrees:
--   <service>, <size>, <postcode district>   e.g. "Paddock topping, 4 acres, SO23"
-- size is the drawn acreage, else the stated figure, else a bale count for
-- hay; the district is what a contractor is allowed to see pre-award, and it
-- is the customer's own postcode, so it is safe in both directions.
--
-- Where it is stamped: sq_notify_once puts the job id on every payload it
-- queues (it always had the id, it just didn't pass it on), and a BEFORE
-- INSERT trigger on pending_emails resolves job_title from the id, or from a
-- client_token / invitation token for the few rows the app queues directly.
-- The sender (send-emails) prints "Re: " + job_title above the body when the
-- key is there, and nothing when it is not — the digest, an announcement.

-- ── The title ──────────────────────────────────────────────────────────────
create or replace function public.sq_job_title(p_submission_id uuid)
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select concat_ws(', ',
    coalesce(sq_service_label(js.service_id, js.service_verbatim), 'Land work'),
    case
      when js.area_mapped_value is not null then js.area_mapped_value || ' acres'
      when js.area_value is not null then
        js.area_value || ' ' || case js.area_unit when 'linear_m' then 'metres' else coalesce(js.area_unit, '') end
      when js.service_attributes ? 'bale_count' then (js.service_attributes ->> 'bale_count') || ' bales'
    end,
    coalesce(nullif(split_part(js.postcode, ' ', 1), ''), c.name))
  from job_submissions js
  left join counties c on c.id = js.county_id
  where js.id = p_submission_id;
$function$;

comment on function public.sq_job_title(uuid) is
  'The job as one line for email reference lines: service, size, postcode district. See 20261009180000.';

-- ── Every queued job email carries its job id ──────────────────────────────
create or replace function public.sq_notify_once(p_submission_id uuid, p_recipient text, p_kind text, p_to_email text, p_payload jsonb)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into submission_notifications (submission_id, recipient, kind)
  values (p_submission_id, p_recipient, p_kind)
  on conflict do nothing;
  if found then
    -- The payload's own keys win; the id is only added where it was missing.
    insert into pending_emails (kind, to_email, payload)
    values (p_kind, p_to_email,
            jsonb_build_object('submission_id', p_submission_id) || coalesce(p_payload, '{}'::jsonb));
    return true;
  end if;
  return false;
end;
$function$;

-- ── …and its title, resolved as it is queued ───────────────────────────────
create or replace function public.pending_emails_stamp_job_title()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if new.payload is null or new.payload ? 'job_title' then
    return new;
  end if;
  begin
    v_id := (new.payload ->> 'submission_id')::uuid;
  exception when others then
    v_id := null;
  end;
  if v_id is null and new.payload ? 'client_token' then
    select id into v_id from job_submissions where client_token = new.payload ->> 'client_token';
  end if;
  if v_id is null and new.payload ? 'token' then
    select submission_id into v_id from job_invitations where token = new.payload ->> 'token';
  end if;
  if v_id is not null then
    new.payload := new.payload || jsonb_build_object('job_title', sq_job_title(v_id));
  end if;
  return new;
exception when others then
  -- A reference line is never worth losing the email over.
  return new;
end;
$function$;

drop trigger if exists pending_emails_stamp_job_title on public.pending_emails;
create trigger pending_emails_stamp_job_title
  before insert on public.pending_emails
  for each row execute function public.pending_emails_stamp_job_title();
