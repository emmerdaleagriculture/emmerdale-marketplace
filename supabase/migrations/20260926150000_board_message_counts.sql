-- The submissions board: how many messages have been sent on each job.
--
-- Threads between customer and contractors landed on 2026-09-25
-- (20260925140000_job_messages.sql). The board row already says who was
-- invited, who opened and who priced; a job with a conversation on it looked
-- no different from one without. Now each row carries the number of messages
-- sent, split by side, and the card shows the tally linking to the thread on
-- the job page.
--
-- The body is the live definition with one lateral and three columns added.

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
      ) em on true
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

revoke execute on function admin_submission_board(int, text[], boolean) from public, anon, authenticated;
grant execute on function admin_submission_board(int, text[], boolean) to service_role;
