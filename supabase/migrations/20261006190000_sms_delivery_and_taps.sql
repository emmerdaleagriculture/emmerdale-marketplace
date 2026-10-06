-- ============================================================================
-- Texts on the /admin/submissions cards: sent, delivered, tapped.
--
-- Delivered: Twilio calls the sms-events edge function as a text's status
-- changes (queued → sent → delivered / undelivered / failed), and the newest
-- final word lands in delivery_status. "Read" doesn't exist for SMS — there
-- are no read receipts — so the card doesn't pretend to show it.
--
-- Tapped: each text carries a short link, /t/<link_code>, instead of the job
-- URL itself. The /t route counts the tap (sms_link_hit) and forwards to
-- `link`. Shorter texts are a bonus: the full /quote/<token> URL alone was
-- about 70 of a segment's 160 characters.
-- ============================================================================

alter table public.pending_sms
  add column if not exists link text,
  add column if not exists link_code text unique,
  add column if not exists delivery_status text,
  add column if not exists delivery_detail text,
  add column if not exists delivery_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists clicks integer not null default 0;

create index if not exists pending_sms_provider_message_idx
  on public.pending_sms (provider_message_id) where provider_message_id is not null;
create index if not exists pending_sms_submission_payload_idx
  on public.pending_sms ((payload->>'submission_id')) where kind = 'sq_invitation';

-- A tap on a text's link: count it, and hand back where it goes. Null when
-- the code is unknown. p_count = false (a link-preview bot) only looks it up.
create or replace function public.sms_link_hit(p_code text, p_count boolean default true)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_link text;
begin
  if p_count then
    update pending_sms
       set clicks = clicks + 1,
           clicked_at = coalesce(clicked_at, now())
     where link_code = p_code
    returning link into v_link;
  else
    select link into v_link from pending_sms where link_code = p_code;
  end if;
  return v_link;
end;
$function$;

revoke all on function public.sms_link_hit(text, boolean) from public, anon, authenticated;
grant execute on function public.sms_link_hit(text, boolean) to service_role;

CREATE OR REPLACE FUNCTION public.admin_submission_board(p_limit integer DEFAULT 200, p_statuses text[] DEFAULT NULL::text[], p_include_hidden boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc), '[]'::jsonb)
  from (
    select js.id, js.created_at, js.status, js.raw_text, js.service_verbatim,
           js.area_value, js.area_unit, js.area_mapped_value, js.postcode,
           js.urgency, js.target_date,
           js.contact_name, js.contact_phone, js.contact_email,
           js.utm_source, js.utm_campaign,
           js.confirmed_at, js.distributed_at, js.expires_at, js.awarded_at,
           js.hidden_at,
           cardinality(js.photo_paths) as photos,
           s.name  as service,
           c.name  as county,
           aw.business_name as awarded_to,
           aw.phone as awarded_phone,
           (select max(e.created_at) from job_events e
             where e.job_id = js.id and e.event_type = 'status_change'
               and e.to_status = js.status) as entered_at,
           inv.invited, inv.opened, inv.priced, inv.declined,
           em.sent as emails_sent, em.delivered as emails_delivered, em.failed as emails_failed,
           tx.sent as texts_sent, tx.delivered as texts_delivered, tx.failed as texts_failed,
           tx.tapped as texts_tapped,
           cq.live as quotes_live, cq.lowest as lowest_client_pence, cq.accepted as accepted_pence,
           pay.deposit_status, pay.deposit_pence,
           pay.balance_status, pay.balance_pence, pay.balance_due_at,
           msg.total as messages, msg.from_client as messages_from_client,
           msg.from_contractor as messages_from_contractor
      from job_submissions js
      left join services s     on s.id = js.service_id
      left join counties c     on c.id = js.county_id
      left join contractors aw on aw.id = js.awarded_contractor_id
      left join lateral (
        select count(*) as invited,
               count(ji.opened_at) as opened,
               count(*) filter (where exists (
                 select 1 from contractor_quotes q where q.invitation_id = ji.id)) as priced,
               count(*) filter (where ji.decline_reason is not null or ji.status = 'declined') as declined
          from job_invitations ji
         where ji.submission_id = js.id
      ) inv on true
      left join lateral (
        select count(*) filter (where pe.status = 'sent') as sent,
               count(*) filter (where pe.delivery_status = 'delivered') as delivered,
               count(*) filter (where pe.status = 'failed'
                                   or pe.delivery_status in ('bounced','complained','failed','suppressed')) as failed
          from pending_emails pe
         where pe.kind = 'sq_invitation'
           and pe.payload->>'submission_id' = js.id::text
           -- Only the newest attempt at each message. A delivery retry is a
           -- full clone of the row it retries, so counting every row would
           -- make one contractor contribute sent=2, and the message we tried
           -- hardest to deliver would read as the worst problem here.
           and not exists (select 1 from pending_emails r where r.retry_of = pe.id)
      ) em on true
      left join lateral (
        select count(*) filter (where ps.status = 'sent') as sent,
               count(*) filter (where ps.delivery_status = 'delivered') as delivered,
               count(*) filter (where ps.status = 'failed'
                                   or ps.delivery_status in ('undelivered','failed')) as failed,
               count(ps.clicked_at) as tapped
          from pending_sms ps
         where ps.kind = 'sq_invitation'
           and ps.payload->>'submission_id' = js.id::text
      ) tx on true
      left join lateral (
        select count(*) filter (where q.status = 'active') as live,
               min(q.client_price_pence) filter (where q.status in ('active','accepted')) as lowest,
               max(q.client_price_pence) filter (where q.status = 'accepted') as accepted
          from client_quotes q
         where q.submission_id = js.id
      ) cq on true
      left join lateral (
        select (array_agg(p.status       order by p.created_at desc) filter (where p.kind = 'deposit'))[1] as deposit_status,
               (array_agg(p.amount_pence order by p.created_at desc) filter (where p.kind = 'deposit'))[1] as deposit_pence,
               (array_agg(p.status       order by p.created_at desc) filter (where p.kind = 'balance'))[1] as balance_status,
               (array_agg(p.amount_pence order by p.created_at desc) filter (where p.kind = 'balance'))[1] as balance_pence,
               (array_agg(p.due_at       order by p.created_at desc) filter (where p.kind = 'balance'))[1] as balance_due_at
          from job_payments p
         where p.submission_id = js.id
      ) pay on true
      left join lateral (
        select count(*) as total,
               count(*) filter (where m.sender = 'client') as from_client,
               count(*) filter (where m.sender = 'contractor') as from_contractor
          from job_messages m
         where m.submission_id = js.id
      ) msg on true
     where (p_statuses is null or js.status = any (p_statuses))
       and (p_include_hidden or js.hidden_at is null)
     order by js.created_at desc
     limit p_limit
  ) b;
$function$;
