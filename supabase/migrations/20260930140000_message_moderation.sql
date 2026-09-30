-- ============================================================================
-- Moderated conversations.
--
-- A contractor can be put under moderation until a date. Until then, every
-- message in their conversations before award — theirs, and the customer's
-- to them — is held until an admin approves it. Both directions, because the
-- case that prompted this (O'Farrell & Sons, 29 Sep 2026) was customers
-- sending a phone number and home address, and the contractor acting on it.
--
-- After award nothing is held: both sides already have each other's details.
--
-- A held message is visible to its sender, marked as waiting, and to nobody
-- else. It sends no email to the other side until it is approved; approving
-- it sends exactly the email posting it would have. Every held message
-- queues an admin email so a job isn't lost waiting on a moderator.
--
-- Builds on 20260930120000_message_photos (sq_post_message with photos).
-- ============================================================================

alter table contractors add column if not exists messages_moderated_until timestamptz;
comment on column contractors.messages_moderated_until is
  'While in the future, pre-award messages in this contractor''s conversations wait for admin approval.';

-- null = never held (every message before this existed, and every ordinary one).
alter table job_messages add column if not exists moderation text
  check (moderation in ('held', 'approved', 'rejected'));
alter table job_messages add column if not exists moderated_at timestamptz;
create index if not exists job_messages_held_idx on job_messages (created_at) where moderation = 'held';

-- ── The email to the other side, for one message ────────────────────────
-- Lifted out of sq_post_message so approving a held message sends the same
-- email posting it would have. Held and rejected messages are left out of
-- both the half-hour hold and the text that goes out.
create or replace function sq_message_alert(p_message_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
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
               when 1 then '[Sent a photo — open the page to see it]'
               else '[Sent ' || cardinality(photo_paths) || ' photos — open the page to see them]'
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
$$;

-- ── sq_post_message: hold when the contractor is under moderation ───────
create or replace function sq_post_message(
  p_invitation_id uuid, p_sender text, p_body text, p_checked_as text,
  p_photo_paths text[] default '{}'
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
      'subject', 'Message waiting for approval — ' || coalesce(v_ct.business_name, 'contractor'),
      'text',
        case when p_sender = 'client' then 'The customer' else coalesce(v_ct.business_name, 'The contractor') end
        || ' wrote to '
        || case when p_sender = 'client' then coalesce(v_ct.business_name, 'the contractor') else 'the customer' end
        || E' on a job still being priced. It is held until you approve it.\n\n'
        || coalesce(nullif(v_body, ''), '(no words)')
        || case when cardinality(v_photos) > 0
                then E'\n\n[' || cardinality(v_photos) || ' photo(s) — look before approving]' else '' end
        || E'\n\nApprove or reject: ' || coalesce(nullif(current_setting('app.site_url', true), ''), 'https://www.emmerdaleagriculture.com')
        || '/admin/submissions/' || v_js.id || '#messages'));
    return jsonb_build_object('ok', true, 'id', v_id, 'held', true);
  end if;

  perform sq_message_alert(v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── The moderator's decision ────────────────────────────────────────────
-- Approving delivers it (and sends the email posting would have); rejecting
-- leaves it visible to its sender only, marked as not delivered.
create or replace function sq_moderate_message(p_message_id uuid, p_approve boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_m job_messages%rowtype;
begin
  select * into v_m from job_messages where id = p_message_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_m.moderation is distinct from 'held' then
    return jsonb_build_object('ok', false, 'reason', 'not_held');
  end if;

  update job_messages
     set moderation = case when p_approve then 'approved' else 'rejected' end,
         moderated_at = now(),
         -- Delivered now, not when it was written: it counts as new to the reader.
         created_at = case when p_approve then now() else created_at end
   where id = p_message_id;

  if p_approve and sq_thread_state(v_m.invitation_id) <> 'closed' then
    perform sq_message_alert(p_message_id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Reading: a held message is not the reader's to mark read ────────────
create or replace function sq_mark_thread_read(p_invitation_id uuid, p_reader text)
returns void
language sql volatile security definer set search_path = public as $$
  update job_messages
     set read_at = now()
   where invitation_id = p_invitation_id
     and sender <> p_reader
     and read_at is null
     and coalesce(moderation, 'approved') = 'approved'
$$;

-- `revoke … from public` alone is a no-op here: default privileges grant
-- anon and authenticated directly, so they are named.
revoke execute on function sq_message_alert(uuid)             from public, anon, authenticated;
revoke execute on function sq_moderate_message(uuid, boolean) from public, anon, authenticated;
revoke execute on function sq_post_message(uuid, text, text, text, text[]) from public, anon, authenticated;
revoke execute on function sq_mark_thread_read(uuid, text)    from public, anon, authenticated;
grant  execute on function sq_message_alert(uuid)             to service_role;
grant  execute on function sq_moderate_message(uuid, boolean) to service_role;
grant  execute on function sq_post_message(uuid, text, text, text, text[]) to service_role;
grant  execute on function sq_mark_thread_read(uuid, text)    to service_role;
