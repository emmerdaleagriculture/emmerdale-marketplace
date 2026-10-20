-- ============================================================================
-- No em dashes in what the database sends people.
--
-- The app's copy lost its em dashes (PR #251); these seven functions build
-- subjects and message placeholders of their own, and were still sending
-- them. Each is its current live definition (pg_get_functiondef) with only
-- the punctuation changed: a colon where the dash labelled, a full stop
-- where it joined two sentences. Nothing else about them moves.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.open_job(p_job_id uuid)
 RETURNS TABLE(customer_name text, customer_phone text, customer_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contractor uuid := auth.uid();
  v_job        record;
begin
  if v_contractor is null then raise exception 'not authenticated'; end if;

  -- Lock the row: a first open must not race an admin close/withdraw past the
  -- status check below.
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.id is null then raise exception 'job not found'; end if;

  -- Already opened → details stay available regardless of current status.
  if not exists (select 1 from contact_reveals cr
                 where cr.job_id = p_job_id and cr.contractor_id = v_contractor) then
    if not exists (select 1 from contractors where id = v_contractor and status = 'approved') then
      raise exception 'contractor not approved';
    end if;
    if not v_job.consent_to_share then raise exception 'job not available'; end if;
    if not exists (select 1 from contractor_counties cc
                   where cc.contractor_id = v_contractor and cc.county_id = v_job.county_id) then
      raise exception 'job is not in one of your counties';
    end if;
    if v_job.status = 'exclusive' and not is_active_subscriber(v_contractor) then
      raise exception 'This job is in the early-access window. It opens to everyone shortly.';
    end if;
    if v_job.status not in ('open','exclusive') then
      raise exception 'This job is no longer available.';
    end if;

    insert into contact_reveals (job_id, contractor_id, route)
      values (p_job_id, v_contractor, 'opened')
      on conflict (job_id, contractor_id) do nothing;
  end if;

  return query
    select j.customer_name, j.customer_phone, j.customer_email
    from jobs j where j.id = p_job_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sq_message_alert(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m    job_messages%rowtype;
  v_inv  job_invitations%rowtype;
  v_js   job_submissions%rowtype;
  v_ct   contractors%rowtype;
  v_all  text;
  v_to   text;
begin
  select * into v_m from job_messages where id = p_message_id;
  if not found then return; end if;
  select * into v_inv from job_invitations where id = v_m.invitation_id;
  select * into v_js from job_submissions where id = v_m.submission_id;
  select * into v_ct from contractors where id = v_inv.contractor_id;

  -- Emailed about this sender in the last half hour and still unread: the
  -- earlier email is enough, and a back-and-forth is not an email per line.
  if exists (
    select 1 from job_messages
     where invitation_id = v_m.invitation_id and sender = v_m.sender and id <> v_m.id
       and read_at is null and alerted_at > now() - interval '30 minutes'
       and coalesce(moderation, 'approved') = 'approved'
  ) then
    return;
  end if;

  update job_messages set alerted_at = now() where id = v_m.id;
  select string_agg(
           concat_ws(E'\n',
             nullif(body, ''),
             case cardinality(photo_paths)
               when 0 then null
               when 1 then '[Sent a photo: open the page to see it]'
               else '[Sent ' || cardinality(photo_paths) || ' photos: open the page to see them]'
             end),
           E'\n\n' order by created_at) into v_all
    from job_messages
   where invitation_id = v_m.invitation_id and sender = v_m.sender and read_at is null
     and coalesce(moderation, 'approved') = 'approved';

  if v_m.sender = 'client' then
    v_to := v_ct.email;
    if v_to is not null then
      perform sq_notify_once(v_js.id, v_inv.contractor_id::text || ':msg:' || v_m.id,
        'sq_message_to_contractor', v_to, jsonb_build_object(
          'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
          'postcode_district', split_part(v_js.postcode, ' ', 1),
          'from', case when v_m.phase = 'post_award'
                       then coalesce(v_js.contact_name, 'The customer')
                       else 'The customer' end,
          'body', v_all,
          'token', v_inv.token));
    end if;
  else
    v_to := v_js.contact_email;
    if v_to is not null then
      perform sq_notify_once(v_js.id, v_to || ':msg:' || v_m.id,
        'sq_message_to_client', v_to, jsonb_build_object(
          'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
          'from', case when v_m.phase = 'post_award' then v_ct.business_name
                       else v_inv.display_label end,
          'body', v_all,
          'client_token', v_js.client_token));
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sq_message_reminder_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        record;
  v_n      int := 0;
  v_hours  int := app_config_num('sq_message_reminder_hours', 24)::int;
  v_local  int := extract(hour from now() at time zone 'Europe/London')::int;
begin
  if v_local < 8 or v_local >= 20 then return 0; end if;

  for r in
    with unread as (
      select m.submission_id, m.invitation_id, m.id, m.body, m.photo_paths, m.phase, m.created_at,
             first_value(m.id) over w as oldest_id,
             min(m.created_at) over (partition by m.invitation_id) as oldest_at
        from job_messages m
       where m.sender = 'contractor'
         and m.read_at is null
         and coalesce(m.moderation, 'approved') = 'approved'
      window w as (partition by m.invitation_id order by m.created_at)
    ),
    threads as (
      select u.submission_id, u.invitation_id, u.oldest_id, u.oldest_at,
             count(*) as n,
             string_agg(
               concat_ws(E'\n',
                 nullif(u.body, ''),
                 case cardinality(u.photo_paths)
                   when 0 then null
                   when 1 then '[Sent a photo: open the page to see it]'
                   else '[Sent ' || cardinality(u.photo_paths) || ' photos: open the page to see them]'
                 end),
               E'\n\n' order by u.created_at) as text,
             bool_or(u.phase = 'post_award') as post_award
        from unread u
       group by u.submission_id, u.invitation_id, u.oldest_id, u.oldest_at
      having u.oldest_at <= now() - make_interval(hours => v_hours)
         and u.oldest_at >  now() - interval '4 days'
    )
    select js.id as submission_id, js.contact_email, js.client_token,
           sq_service_label(js.service_id, js.service_verbatim) as service,
           (array_agg(t.oldest_id order by t.oldest_at desc))[1] as key_id,
           jsonb_agg(jsonb_build_object(
             'from', case when t.post_award then ct.business_name else ji.display_label end,
             'count', t.n,
             'since', t.oldest_at,
             'body', t.text) order by t.oldest_at) as threads
      from threads t
      join job_invitations ji on ji.id = t.invitation_id
      join contractors ct on ct.id = ji.contractor_id
      join job_submissions js on js.id = t.submission_id
     where js.contact_email is not null
       and sq_thread_state(t.invitation_id) <> 'closed'
     group by js.id
  loop
    if sq_notify_once(r.submission_id, r.contact_email || ':msgrem:' || r.key_id,
         'sq_message_reminder_to_client', r.contact_email,
         jsonb_build_object('service', r.service, 'client_token', r.client_token,
                            'threads', r.threads)) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.sq_visit_declined(p_submission_id uuid, p_refund_pence integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js    job_submissions%rowtype;
  v_email text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status = 'cancelled' and v_js.visit_status = 'declined' then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if v_js.visit_status is distinct from 'revised' or v_js.status <> 'variation_pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_revised');
  end if;

  update job_submissions
     set status = 'cancelled', visit_status = 'declined', visit_decided_at = now()
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'variation_pending', 'cancelled', 'client', null,
    'revised price declined after the site visit; deposit refunded in full',
    jsonb_build_object('refund_pence', p_refund_pence));

  update job_payments set status = 'expired', last_error = 'job cancelled'
   where submission_id = v_js.id and kind = 'balance' and status in ('due', 'requested', 'failed', 'pending');
  update job_payments
     set status = 'refunded', refunded_pence = amount_pence, refunded_at = now()
   where submission_id = v_js.id and kind = 'deposit' and status = 'paid';

  select email into v_email from contractors where id = v_js.awarded_contractor_id;
  if v_email is not null then
    perform sq_notify_once(v_js.id, v_email || ':visit_declined', 'sq_visit_declined', v_email,
      jsonb_build_object('contact_name', v_js.contact_name));
  end if;
  insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
    jsonb_build_object(
      'subject', 'Revised price declined: job cancelled and deposit refunded',
      'text', 'The customer on job ' || v_js.id || ' declined the price revised after the site visit. '
        || 'The job is cancelled and ' || round(p_refund_pence / 100.0, 2)
        || E' GBP was refunded to their card.'));
  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sq_visit_revise(p_submission_id uuid, p_contractor_id uuid, p_contractor_pence integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js     job_submissions%rowtype;
  v_cl     client_quotes%rowtype;
  v_client int;
  v_paid   int;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name   text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.awarded_contractor_id is distinct from p_contractor_id then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  if v_js.visit_status is distinct from 'awaiting_visit'
     or v_js.status not in ('awarded', 'contacted', 'scheduled') then
    return jsonb_build_object('ok', false, 'reason', 'not_awaiting');
  end if;
  if p_contractor_pence is null or p_contractor_pence <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_price');
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_reason');
  end if;

  select * into v_cl from client_quotes where id = v_js.accepted_client_quote_id;
  v_client := client_price_pence(p_contractor_pence, v_cl.markup_rate);

  -- A price below what the customer has already paid would need part of the
  -- deposit handed back; that is a conversation, not a button.
  select coalesce(sum(amount_pence), 0) into v_paid from job_payments
   where submission_id = v_js.id and kind = 'deposit' and status = 'paid';
  if v_client < v_paid then
    return jsonb_build_object('ok', false, 'reason', 'below_deposit',
      'min_contractor_pence', ceil(v_paid / (1 + v_cl.markup_rate))::int);
  end if;
  if v_client = v_cl.client_price_pence then
    return jsonb_build_object('ok', false, 'reason', 'same_price');
  end if;

  update job_submissions
     set visit_status = 'revised',
         visit_revised_contractor_pence = p_contractor_pence,
         visit_revised_client_pence = v_client,
         visit_revision_reason = v_reason,
         visit_prev_status = v_js.status,
         status = 'variation_pending'
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'variation_pending', 'contractor',
    p_contractor_id, 'price revised after the site visit',
    jsonb_build_object('old_client_pence', v_cl.client_price_pence, 'new_client_pence', v_client,
                       'new_contractor_pence', p_contractor_pence));

  select business_name into v_name from contractors where id = p_contractor_id;
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown') || ':visit_revised',
    'sq_visit_revised', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contact_name', v_js.contact_name,
      'contractor_business_name', v_name,
      'old_pence', v_cl.client_price_pence,
      'new_pence', v_client,
      'reason', v_reason));
  insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
    jsonb_build_object(
      'subject', 'Price revised after a site visit: ' || coalesce(v_name, 'contractor'),
      'text', coalesce(v_name, 'The contractor') || ' revised the price on job ' || v_js.id
        || ' after visiting: ' || round(v_cl.client_price_pence / 100.0, 2)
        || ' → ' || round(v_client / 100.0, 2) || E' (customer price, GBP).\n\nReason: '
        || v_reason || E'\n\nThe customer can accept or decline on their job page.'));
  return jsonb_build_object('ok', true, 'new_client_pence', v_client);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.subscriptions_premium_reinstatement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record;
  v_started boolean;
begin
  select id, business_name, status, vetted_at, premium_reinstated_at
    into c from contractors where id = new.contractor_id;
  if not found then
    return new;
  end if;

  v_started := new.status in ('active', 'past_due')
    and (tg_op = 'INSERT' or old.status is null or old.status not in ('active', 'past_due'));

  if v_started and c.status = 'suspended' and c.vetted_at is not null then
    perform set_config('sq.premium_status_change', '1', true);
    update contractors
       set status = 'approved', premium_reinstated_at = now()
     where id = c.id;
    perform set_config('sq.premium_status_change', '', true);
    insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
      jsonb_build_object(
        'subject', 'Suspended contractor back on premium: ' || c.business_name,
        'text', c.business_name || ' was suspended and has taken out premium, so their account is active again with the premium terms. If premium ends they are suspended again.' || E'\n\n' ||
                coalesce(current_setting('app.site_url', true), 'https://www.emmerdaleagriculture.com') || '/admin/contractors/' || c.id));

  elsif c.premium_reinstated_at is not null and c.status = 'approved'
        and not contractor_is_premium(c.id) then
    perform set_config('sq.premium_status_change', '1', true);
    update contractors
       set status = 'suspended', premium_reinstated_at = null
     where id = c.id;
    perform set_config('sq.premium_status_change', '', true);
    -- As the admin Suspend button does: their live prices come off too.
    update client_quotes set status = 'closed'
     where contractor_id = c.id and status = 'active';
    insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
      jsonb_build_object(
        'subject', 'Premium ended: ' || c.business_name || ' suspended again',
        'text', c.business_name || ' was back on the platform only because of premium. Their membership has ended, so they are suspended again and their live prices are closed.' || E'\n\n' ||
                coalesce(current_setting('app.site_url', true), 'https://www.emmerdaleagriculture.com') || '/admin/contractors/' || c.id));
  end if;

  return new;
end;
$function$
;

