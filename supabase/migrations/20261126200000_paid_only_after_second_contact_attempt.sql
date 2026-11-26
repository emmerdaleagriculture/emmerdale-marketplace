-- A second attempt to pass contact details or take a job off the site
-- (platform_flags, a day or more after an earlier one): the contractor still
-- receives jobs, but pricing them and writing to customers before award needs
-- a paid membership (Pro or Premium, a comp included). contractors.
-- paid_only_since is when that began; null lifts it (Admin > contractor).
-- Set by offPlatformAlert.ts (strike), enforced here so every pricing path
-- (the page, the email-parse route) and the message box get the same answer.

alter table public.contractors add column if not exists paid_only_since timestamptz;

comment on column public.contractors.paid_only_since is
  'Since when pricing and pre-award messages need a paid membership (second contact attempt). Null = no restriction.';

create or replace function public.contractor_paid_only(p_contractor_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from contractors c
                  where c.id = p_contractor_id and c.paid_only_since is not null)
     and not contractor_is_premium(p_contractor_id)
$function$;

-- revoke from public is a no-op here: anon and authenticated are granted directly.
revoke all on function public.contractor_paid_only(uuid) from public, anon, authenticated;
grant execute on function public.contractor_paid_only(uuid) to service_role;

-- The contractor can update their own row: this column is not theirs to clear.
CREATE OR REPLACE FUNCTION public.guard_contractor_columns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or current_setting('sq.premium_status_change', true) = '1' then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'contractor status can only be changed by an admin';
  end if;
  if new.vetted_at is distinct from old.vetted_at and current_user in ('authenticated', 'anon') then
    raise exception 'contractor vetting can only be changed by an admin';
  end if;
  if new.paid_only_since is distinct from old.paid_only_since and current_user in ('authenticated', 'anon') then
    raise exception 'this can only be changed by an admin';
  end if;
  return new;
end;
$function$;

-- Pricing: refused with upgrade_required. Body otherwise as live.
CREATE OR REPLACE FUNCTION public.submit_contractor_quote(p_token text, p_quote_type text, p_price_pence integer, p_rate_value_pence integer, p_rate_minimum_pence integer, p_site_visit boolean, p_notes text, p_valid_until date, p_source text, p_confirmed boolean, p_price_basis text DEFAULT 'unspecified'::text, p_note_to_client text DEFAULT NULL::text, p_unit_label text DEFAULT NULL::text, p_unit_quantity numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv job_invitations%rowtype;
  v_js job_submissions%rowtype;
  v_prior contractor_quotes%rowtype;
  v_prior_cq_status text;
  v_acres numeric;
  v_price int;
  v_new_id uuid;
  v_confirm_token text;
  v_note text;
  v_unit text;
begin
  select * into v_inv from job_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_js from job_submissions where id = v_inv.submission_id for update;

  if v_js.status not in ('distributed','quotes_receiving','accepted_awaiting_payment') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if v_inv.status in ('declined','closed_awarded','closed_stale') then
    return jsonb_build_object('ok', false, 'reason', 'declined');
  end if;
  -- Old invitation links still work as links; a suspended contractor cannot price.
  if exists (select 1 from contractors where id = v_inv.contractor_id and status = 'suspended') then
    return jsonb_build_object('ok', false, 'reason', 'suspended');
  end if;
  -- A second contact attempt: jobs still arrive, pricing needs a paid membership.
  if contractor_paid_only(v_inv.contractor_id) then
    return jsonb_build_object('ok', false, 'reason', 'upgrade_required');
  end if;
  if p_quote_type not in ('total','rate','unit') then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;
  if coalesce(p_price_basis, 'unspecified') not in ('unspecified','inc_vat','no_vat') then
    return jsonb_build_object('ok', false, 'reason', 'bad_basis');
  end if;

  v_note := nullif(left(trim(coalesce(p_note_to_client, '')), 200), '');
  v_unit := nullif(left(trim(coalesce(p_unit_label, '')), 24), '');

  if p_quote_type = 'rate' then
    if p_rate_value_pence is null or p_rate_value_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_rate');
    end if;
    v_acres := coalesce(v_js.area_mapped_value,
                        case when v_js.area_unit = 'acres' then v_js.area_value end);
    if v_acres is null or v_acres <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'rate_needs_area');
    end if;
    v_price := greatest(round(p_rate_value_pence * v_acres)::int,
                        coalesce(p_rate_minimum_pence, 0));
  elsif p_quote_type = 'unit' then
    -- Both halves, or it is not a price the customer can accept.
    if p_rate_value_pence is null or p_rate_value_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_rate');
    end if;
    if p_unit_quantity is null or p_unit_quantity <= 0 or v_unit is null then
      return jsonb_build_object('ok', false, 'reason', 'unit_needs_quantity');
    end if;
    v_price := greatest(round(p_rate_value_pence * p_unit_quantity)::int,
                        coalesce(p_rate_minimum_pence, 0));
  else
    if p_price_pence is null or p_price_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_price');
    end if;
    v_price := p_price_pence;
  end if;

  if p_valid_until is not null and v_js.expires_at is not null
     and p_valid_until > v_js.expires_at::date then
    p_valid_until := v_js.expires_at::date;
  end if;

  select * into v_prior from contractor_quotes
   where submission_id = v_js.id and contractor_id = v_inv.contractor_id
     and superseded_by is null and confirmed_by_contractor
   order by created_at desc limit 1;

  if v_prior.id is not null then
    select status into v_prior_cq_status
      from client_quotes where contractor_quote_id = v_prior.id;
    if v_prior_cq_status = 'accepted' then
      return jsonb_build_object('ok', false, 'reason', 'accepted_pending_payment');
    end if;
  end if;

  if p_confirmed = false then v_confirm_token := sq_token(); end if;

  if coalesce(p_confirmed, true) and v_prior.id is not null then
    update contractor_quotes set superseded_by = v_prior.id where id = v_prior.id;
  end if;

  insert into contractor_quotes (
    submission_id, contractor_id, invitation_id, quote_type,
    contractor_price_pence, rate_value_pence, rate_minimum_pence,
    notes_internal, site_visit_required, valid_until,
    source, confirmed_by_contractor, confirm_token, price_basis,
    note_to_client, unit_label, unit_quantity
  ) values (
    v_js.id, v_inv.contractor_id, v_inv.id, p_quote_type,
    v_price, p_rate_value_pence, p_rate_minimum_pence,
    nullif(trim(coalesce(p_notes,'')), ''), coalesce(p_site_visit, false),
    coalesce(p_valid_until, coalesce(v_js.expires_at::date, current_date + 7)),
    p_source, coalesce(p_confirmed, true), v_confirm_token,
    coalesce(p_price_basis, 'unspecified'),
    v_note,
    case when p_quote_type = 'unit' then v_unit end,
    case when p_quote_type = 'unit' then p_unit_quantity end
  ) returning id into v_new_id;

  if coalesce(p_confirmed, true) and v_prior.id is not null then
    update contractor_quotes set superseded_by = v_new_id where id = v_prior.id;
    update client_quotes set status = 'superseded'
     where contractor_quote_id = v_prior.id and status = 'active';
    insert into invitation_events (invitation_id, contractor_id, event_type)
    values (v_inv.id, v_inv.contractor_id, 'revised');
  else
    insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
    values (v_inv.id, v_inv.contractor_id,
            case when coalesce(p_confirmed, true) then 'priced' else 'confirm_pending' end,
            jsonb_build_object('time_to_price_seconds',
              extract(epoch from now() - v_inv.sent_at)::int));
  end if;

  if coalesce(p_confirmed, true) then
    perform sq_publish_quote(v_new_id);
    return jsonb_build_object('ok', true, 'quote_id', v_new_id);
  end if;

  insert into pending_emails (kind, to_email, payload)
  select 'sq_quote_confirm', ct.email, jsonb_build_object(
    'confirm_token', v_confirm_token,
    'amount_pence', v_price,
    'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
    'postcode_district', split_part(v_js.postcode, ' ', 1))
  from contractors ct where ct.id = v_inv.contractor_id;
  return jsonb_build_object('ok', true, 'quote_id', v_new_id, 'pending_confirm', true);
end;
$function$;

-- Messages before award: the same. Body otherwise as live.
CREATE OR REPLACE FUNCTION public.sq_post_message(p_invitation_id uuid, p_sender text, p_body text, p_checked_as text, p_photo_paths text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv    job_invitations%rowtype;
  v_js     job_submissions%rowtype;
  v_ct     contractors%rowtype;
  v_state  text;
  v_label  text;
  v_id     uuid;
  v_body   text := btrim(coalesce(p_body, ''));
  v_photos text[] := coalesce(p_photo_paths, '{}');
  v_held   boolean;
begin
  if p_sender not in ('client', 'contractor') then
    return jsonb_build_object('ok', false, 'reason', 'bad_sender');
  end if;
  if char_length(v_body) > 2000
     or (char_length(v_body) = 0 and cardinality(v_photos) = 0) then
    return jsonb_build_object('ok', false, 'reason', 'bad_length');
  end if;
  if cardinality(v_photos) > 4 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_photos');
  end if;

  select * into v_inv from job_invitations where id = p_invitation_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  -- A photo must sit in this job's folder: the caller uploaded it there, and
  -- a path into another job's folder would show that job's pictures here.
  if exists (select 1 from unnest(v_photos) p
              where p not like v_inv.submission_id::text || '/%') then
    return jsonb_build_object('ok', false, 'reason', 'bad_photo');
  end if;
  -- Before anything else, and before the label lock: see sq_invitation_label.
  select * into v_js from job_submissions where id = v_inv.submission_id for key share;
  select * into v_ct from contractors where id = v_inv.contractor_id;
  -- A suspended contractor's threads are closed both ways (20261005200000).
  if v_ct.status = 'suspended' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  v_state := sq_thread_state(p_invitation_id);
  if v_state = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if v_state is distinct from p_checked_as then
    return jsonb_build_object('ok', false, 'reason', 'state_changed', 'state', v_state);
  end if;
  -- A second contact attempt: before a job is theirs, writing to the
  -- customer needs a paid membership. A job they hold is not cut off.
  if p_sender = 'contractor' and v_state = 'pre_award' and contractor_paid_only(v_ct.id) then
    return jsonb_build_object('ok', false, 'reason', 'upgrade_required');
  end if;

  if p_sender = 'client' and v_state = 'pre_award' and v_inv.display_label is null
     and not exists (select 1 from client_quotes
                      where submission_id = v_js.id and contractor_id = v_inv.contractor_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_thread');
  end if;
  v_label := sq_invitation_label(p_invitation_id);

  -- A person typing does not send twenty messages an hour.
  if (select count(*) from job_messages
       where invitation_id = p_invitation_id and sender = p_sender
         and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  v_held := v_state = 'pre_award' and v_ct.messages_moderated_until > now();

  insert into job_messages (submission_id, invitation_id, sender, body, phase, photo_paths, moderation)
  values (v_js.id, p_invitation_id, p_sender, v_body, v_state, v_photos,
          case when v_held then 'held' end)
  returning id into v_id;

  if v_held then
    insert into pending_emails (kind, to_email, payload)
    values ('admin_direct', '__admin__', jsonb_build_object(
      'subject', 'Message waiting for approval: ' || coalesce(v_ct.business_name, 'contractor'),
      'text',
        case when p_sender = 'client' then 'The customer' else coalesce(v_ct.business_name, 'The contractor') end
        || ' wrote to '
        || case when p_sender = 'client' then coalesce(v_ct.business_name, 'the contractor') else 'the customer' end
        || E' on a job still being priced. It is held until you approve it.\n\n'
        || coalesce(nullif(v_body, ''), '(no words)')
        || case when cardinality(v_photos) > 0
                then E'\n\n[' || cardinality(v_photos) || ' photo(s): look before approving]' else '' end
        || E'\n\nApprove or reject: ' || coalesce(nullif(current_setting('app.site_url', true), ''), 'https://www.emmerdaleagriculture.com')
        || '/admin/submissions/' || v_js.id || '#messages'));
    return jsonb_build_object('ok', true, 'id', v_id, 'held', true);
  end if;

  perform sq_message_alert(v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;
