-- ============================================================================
-- Pictures in customer↔contractor messages.
--
-- A message can now carry up to four photos — the gateway, the bank that
-- needs cutting, the machine that would do it — and may be a photo on its
-- own, with no words.
--
-- Allowed before award as well as after, knowing a photo cannot be read the
-- way messageText.ts reads a sentence: a contractor's van has its phone
-- number down the side. The admin job page marks pre-award photos so they can
-- be looked at; nothing here pretends to check them.
--
-- The files live in the private message-photos bucket, one folder per job,
-- written and read only through the service role and short-lived signed URLs,
-- like job-photos.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-photos', 'message-photos', false,
  10485760,  -- 10MB per object; the browser downscales before sending anyway
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

alter table job_messages add column if not exists photo_paths text[] not null default '{}';

-- Words, a photo, or both — never neither.
alter table job_messages drop constraint if exists job_messages_body_check;
alter table job_messages add constraint job_messages_body_check check (
  char_length(btrim(body)) <= 2000
  and (char_length(btrim(body)) >= 1 or cardinality(photo_paths) > 0)
);
alter table job_messages add constraint job_messages_photo_count_check
  check (cardinality(photo_paths) <= 4);

-- ── sq_post_message, with photos ────────────────────────────────────────
-- The live definition (20260925140000) with p_photo_paths added. It is
-- dropped rather than overloaded: two versions differing by a defaulted
-- argument make every four-argument call ambiguous. The default keeps the
-- app that is live while this runs — which never passes photos — working.
drop function if exists sq_post_message(uuid, text, text, text);

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
  v_to     text;
  v_all    text;
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
  -- Key share is enough — it is what the insert below needs anyway — and it
  -- still waits behind a price or an award holding the row.
  select * into v_js from job_submissions where id = v_inv.submission_id for key share;
  select * into v_ct from contractors where id = v_inv.contractor_id;

  v_state := sq_thread_state(p_invitation_id);
  if v_state = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if v_state is distinct from p_checked_as then
    return jsonb_build_object('ok', false, 'reason', 'state_changed', 'state', v_state);
  end if;

  -- The customer can only see threads that have a label, so before award
  -- they can only be answering one. A contractor writing first is what
  -- gives the thread its label, so the refusal comes before the allocation.
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

  insert into job_messages (submission_id, invitation_id, sender, body, phase, photo_paths)
  values (v_js.id, p_invitation_id, p_sender, v_body, v_state, v_photos)
  returning id into v_id;

  -- Email the other side, unless they were emailed about this sender in the
  -- last half hour and still haven't read it — a back-and-forth should not
  -- become an email per line. When an email does go, it carries every
  -- unread message from this sender, so nothing said in the quiet spell is
  -- only on the page. Photos are not attached: the email says there is one
  -- and the link opens the page it is on.
  if not exists (
    select 1 from job_messages
     where invitation_id = p_invitation_id and sender = p_sender and id <> v_id
       and read_at is null and alerted_at > now() - interval '30 minutes'
  ) then
    update job_messages set alerted_at = now() where id = v_id;
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
     where invitation_id = p_invitation_id and sender = p_sender and read_at is null;

    if p_sender = 'client' then
      v_to := v_ct.email;
      if v_to is not null then
        perform sq_notify_once(v_js.id, v_inv.contractor_id::text || ':msg:' || v_id,
          'sq_message_to_contractor', v_to, jsonb_build_object(
            'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
            'postcode_district', split_part(v_js.postcode, ' ', 1),
            'from', case when v_state = 'post_award'
                         then coalesce(v_js.contact_name, 'The customer')
                         else 'The customer' end,
            'body', v_all,
            'token', v_inv.token));
      end if;
    else
      v_to := v_js.contact_email;
      if v_to is not null then
        perform sq_notify_once(v_js.id, v_to || ':msg:' || v_id,
          'sq_message_to_client', v_to, jsonb_build_object(
            'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
            'from', case when v_state = 'post_award' then v_ct.business_name
                         else v_label end,
            'body', v_all,
            'client_token', v_js.client_token));
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- `revoke … from public` alone is a no-op here: default privileges grant
-- anon and authenticated directly, so they are named.
revoke execute on function sq_post_message(uuid, text, text, text, text[]) from public, anon, authenticated;
grant  execute on function sq_post_message(uuid, text, text, text, text[]) to service_role;
