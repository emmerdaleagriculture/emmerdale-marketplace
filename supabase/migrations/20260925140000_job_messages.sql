-- ============================================================================
-- Messages between a customer and a contractor, one thread per invitation.
--
-- Before award the two sides are still masked: the customer sees "Contractor
-- B", the contractor sees "the customer" and a postcode district. The thread
-- must not undo that, so the text is checked before it gets here
-- (src/lib/sealedQuotes/messageText.ts: no phone numbers, emails or links
-- before award, and never a contractor's own figure, because the customer
-- sees our price, not theirs). The database enforces the shape and who may
-- write when; it does not read the sentence.
--
-- After award the winner's thread carries on with names on it. Every other
-- thread on the job closes and stays readable.
--
-- Nothing here is reachable by anon or authenticated. Both pages that use it
-- are token-addressed and go through the service role, as client_quotes does.
-- ============================================================================

-- ── A label that exists before a price does ─────────────────────────────
-- "Contractor A/B/…" used to be allocated only when a price was published,
-- from client_quotes. A contractor who asks a question first needs one then,
-- and it must be the same letter their price shows up under later, so the
-- label moves onto the invitation and both paths allocate through one
-- function.
alter table job_invitations add column if not exists display_label text;

update job_invitations ji
   set display_label = cq.contractor_display_label
  from (select distinct on (submission_id, contractor_id)
               submission_id, contractor_id, contractor_display_label
          from client_quotes
         order by submission_id, contractor_id, created_at) cq
 where cq.submission_id = ji.submission_id
   and cq.contractor_id = ji.contractor_id
   and ji.display_label is null;

create or replace function sq_invitation_label(p_invitation_id uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv job_invitations%rowtype;
  v_label text;
  v_n int;
begin
  select * into v_inv from job_invitations where id = p_invitation_id;
  if not found then return null; end if;
  if v_inv.display_label is not null then return v_inv.display_label; end if;

  -- Two contractors writing at the same moment must not both become "C".
  -- An advisory lock rather than the submission row: award_submission and
  -- the quote path already lock that row in their own order.
  perform pg_advisory_xact_lock(hashtext('sq_label:' || v_inv.submission_id::text));

  select display_label into v_label from job_invitations where id = p_invitation_id;
  if v_label is null then
    -- A price published before this migration without a backfilled row.
    select contractor_display_label into v_label
      from client_quotes
     where submission_id = v_inv.submission_id and contractor_id = v_inv.contractor_id
     limit 1;
  end if;
  if v_label is null then
    select count(*) + 1 into v_n
      from job_invitations
     where submission_id = v_inv.submission_id and display_label is not null;
    v_label := 'Contractor ' || case when v_n <= 26 then chr(64 + v_n) else v_n::text end;
  end if;

  update job_invitations set display_label = v_label where id = p_invitation_id;
  return v_label;
end;
$$;

-- ── The messages ────────────────────────────────────────────────────────
create table if not exists job_messages (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references job_submissions(id) on delete cascade,
  -- The thread. admin_delete_submission deletes invitations, and the
  -- messages go with them.
  invitation_id  uuid not null references job_invitations(id) on delete cascade,
  sender         text not null check (sender in ('client', 'contractor')),
  body           text not null check (char_length(btrim(body)) between 1 and 2000),
  -- Which rules it was written under, so a later reader knows whether it was
  -- checked for contact details.
  phase          text not null check (phase in ('pre_award', 'post_award')),
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);
create index if not exists job_messages_thread_idx on job_messages (invitation_id, created_at);
create index if not exists job_messages_submission_idx on job_messages (submission_id, created_at);

alter table job_messages enable row level security;
revoke all on job_messages from public, anon, authenticated;
grant all on job_messages to service_role;

-- 'pre_award' | 'post_award' | 'closed'. The single place that decides who
-- may still write.
create or replace function sq_thread_state(p_invitation_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when js.status in ('distributed', 'quotes_receiving', 'accepted_awaiting_payment')
     and ji.status in ('sent', 'viewed', 'priced')
      then 'pre_award'
    when js.awarded_contractor_id = ji.contractor_id
     and js.status in ('awarded', 'contacted', 'scheduled', 'in_progress',
                       'completed_by_contractor', 'completed', 'paid')
      then 'post_award'
    else 'closed'
  end
  from job_invitations ji
  join job_submissions js on js.id = ji.submission_id
  where ji.id = p_invitation_id
$$;

-- One write path for both sides. Returns {ok, id} or {ok:false, reason}.
create or replace function sq_post_message(
  p_invitation_id uuid, p_sender text, p_body text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv   job_invitations%rowtype;
  v_js    job_submissions%rowtype;
  v_ct    contractors%rowtype;
  v_state text;
  v_label text;
  v_id    uuid;
  v_body  text := btrim(coalesce(p_body, ''));
  v_to    text;
begin
  if p_sender not in ('client', 'contractor') then
    return jsonb_build_object('ok', false, 'reason', 'bad_sender');
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_length');
  end if;

  select * into v_inv from job_invitations where id = p_invitation_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_js from job_submissions where id = v_inv.submission_id;
  select * into v_ct from contractors where id = v_inv.contractor_id;

  v_state := sq_thread_state(p_invitation_id);
  if v_state = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
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

  insert into job_messages (submission_id, invitation_id, sender, body, phase)
  values (v_js.id, p_invitation_id, p_sender, v_body, v_state)
  returning id into v_id;

  -- Email the other side, unless they already have an unread message from
  -- this sender in the last half hour: that one's alert is still sitting in
  -- their inbox, and a back-and-forth should not become an email per line.
  if not exists (
    select 1 from job_messages
     where invitation_id = p_invitation_id and sender = p_sender and id <> v_id
       and read_at is null and created_at > now() - interval '30 minutes'
  ) then
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
            'body', v_body,
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
            'body', v_body,
            'client_token', v_js.client_token));
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- The reader has opened the page: everything the other side sent is read.
create or replace function sq_mark_thread_read(p_invitation_id uuid, p_reader text)
returns void
language sql volatile security definer set search_path = public as $$
  update job_messages
     set read_at = now()
   where invitation_id = p_invitation_id
     and sender <> p_reader
     and read_at is null
$$;

revoke execute on function sq_invitation_label(uuid)            from public, anon, authenticated;
revoke execute on function sq_thread_state(uuid)                from public, anon, authenticated;
revoke execute on function sq_post_message(uuid, text, text)    from public, anon, authenticated;
revoke execute on function sq_mark_thread_read(uuid, text)      from public, anon, authenticated;
grant  execute on function sq_invitation_label(uuid)            to service_role;
grant  execute on function sq_thread_state(uuid)                to service_role;
grant  execute on function sq_post_message(uuid, text, text)    to service_role;
grant  execute on function sq_mark_thread_read(uuid, text)      to service_role;

-- ── sq_publish_quote (live definition, from 20260922230000) ─────────────
-- Only the label block changes: it now allocates through
-- sq_invitation_label, so a question asked before pricing and the price
-- that follows carry the same letter.
CREATE OR REPLACE FUNCTION public.sq_publish_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cq contractor_quotes%rowtype;
  v_js job_submissions%rowtype;
  v_rate numeric;
  v_label text;
  v_ct contractors%rowtype;
begin
  select * into v_cq from contractor_quotes where id = p_quote_id;
  select * into v_js from job_submissions where id = v_cq.submission_id;
  select * into v_ct from contractors where id = v_cq.contractor_id;
  v_rate := app_config_num('sq_markup_rate', 0.10);

  -- Stable label, shared with the message thread: a contractor who asked the
  -- customer a question before pricing already has one (20260925140000).
  v_label := sq_invitation_label(v_cq.invitation_id);

  insert into client_quotes (
    submission_id, contractor_quote_id, contractor_id,
    client_price_pence, markup_rate,
    client_rate_value_pence, client_rate_minimum_pence,
    contractor_display_label, contractor_rating_avg, contractor_rating_count,
    distance_miles, site_visit_required, valid_until, price_basis,
    contractor_note, unit_label, unit_quantity
  )
  select
    v_cq.submission_id, v_cq.id, v_cq.contractor_id,
    client_price_pence(v_cq.contractor_price_pence, v_rate), v_rate,
    -- Rate quotes: the rate itself is marked up to the penny (ceil); the
    -- headline indicative total above gets the full ceil-to-£5 treatment.
    case when v_cq.rate_value_pence is not null
         then ceil(v_cq.rate_value_pence * (1 + v_rate))::int end,
    case when v_cq.rate_minimum_pence is not null
         then ceil(v_cq.rate_minimum_pence * (1 + v_rate))::int end,
    v_label, v_ct.rating_avg, v_ct.rating_count,
    i.distance_miles, v_cq.site_visit_required, v_cq.valid_until, v_cq.price_basis,
    v_cq.note_to_client,
    -- Carried so the customer sees "£12 per bale × 20", not a bare total with
    -- no way to tell how it was arrived at.
    v_cq.unit_label, v_cq.unit_quantity
  from job_invitations i where i.id = v_cq.invitation_id;

  update job_invitations set status = 'priced' where id = v_cq.invitation_id;

  perform log_job_event(v_cq.submission_id, 'quote_received', null, null, 'contractor',
    v_cq.contractor_id, null,
    jsonb_build_object('quote_id', v_cq.id,
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate)));

  -- First price → quotes_receiving + immediate client email (§16a.1).
  -- The note deliberately does NOT go in this email: email cannot be
  -- retracted and toHtml() linkifies anything that looks like a URL.
  if v_js.status = 'distributed' then
    update job_submissions set status = 'quotes_receiving', quotes_notified_at = now()
     where id = v_js.id;
    perform log_job_event(v_js.id, 'status_change', 'distributed', 'quotes_receiving',
      'system', null, null, '{}');
    insert into pending_emails (kind, to_email, payload)
    values ('sq_first_quote', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate),
      'contractor_label', v_label,
      'price_basis', v_cq.price_basis,
      'contact_name', v_js.contact_name,
      'sole_offer', v_js.first_refusal and v_js.market_opens_at is not null
                    and v_js.preferred_contractor_id = v_cq.contractor_id));
  end if;
end;
$function$;
