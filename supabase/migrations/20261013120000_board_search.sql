-- ============================================================================
-- Search on /admin/submissions.
--
-- The board shows the latest 200 jobs, so a customer who wrote in a month ago
-- is off the bottom of it, and the only way to their job was the email. A
-- search box now asks this function for the rows that match a term, in the
-- database, across every job rather than the 200 on screen.
--
-- p_search matches, case-insensitively, anywhere in: the contact name, email
-- and postcode left with the job; the job text; the account's email, name and
-- phone when the customer has one; the winning contractor's business name
-- and email; the job id exactly. Postcodes compare with their spaces removed,
-- so "GU10 1AA" finds "GU101AA". Phones compare digits only, with a leading
-- 44 or 0044 read as 0 on both sides, so "07700 900" finds "+44 7700 900123"
-- and the text-alert mobile is searched too. Null means no search, as before.
--
-- The signature changes, so the old one is dropped first: PostgREST cannot
-- choose between two overloads and would refuse every call.
-- ============================================================================

drop function if exists public.admin_submission_board(integer, text[], boolean);

-- A phone number as bare digits in national form: "+44 (0)7700 900123",
-- "447700900123", "0044 7700 900123" and "07700 900123" all give
-- "07700900123": a UK number never starts with 0 after the 44, so a 0 there
-- is the bracketed kind. Empty for null.
create or replace function public.uk_phone_digits(p text)
 returns text
 language sql
 immutable
 parallel safe
as $function$
  select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^(00)?440?', '0')
$function$;

revoke execute on function public.uk_phone_digits(text) from public, anon, authenticated;
grant execute on function public.uk_phone_digits(text) to service_role;

create or replace function public.admin_submission_board(p_limit integer default 200, p_statuses text[] default null::text[], p_include_hidden boolean default false, p_search text default null)
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
      left join customers   cu on cu.id = js.customer_id
      -- The search term as a pattern (its own %, _ and \ taken literally),
      -- the same with spaces removed for postcodes, and as bare digits in
      -- national form for phone numbers however they were written.
      cross join lateral (
        select '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
               '%' || regexp_replace(replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_'), '\s', '', 'g') || '%' as pat_nospace,
               uk_phone_digits(p_search) as digits
      ) q
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
       and (p_search is null
            or js.contact_name     ilike q.pat
            or js.contact_email    ilike q.pat
            or regexp_replace(js.postcode, '\s', '', 'g') ilike q.pat_nospace
            or js.raw_text         ilike q.pat
            or js.service_verbatim ilike q.pat
            or cu.email            ilike q.pat
            or cu.contact_name     ilike q.pat
            or aw.business_name    ilike q.pat
            or aw.email            ilike q.pat
            or js.id::text = lower(p_search)
            or (length(q.digits) >= 3 and (
                 uk_phone_digits(js.contact_phone) like '%' || q.digits || '%'
              or uk_phone_digits(js.sms_phone)     like '%' || q.digits || '%'
              or uk_phone_digits(cu.phone)         like '%' || q.digits || '%')))
     order by js.created_at desc
     limit p_limit
  ) b;
$function$;

revoke execute on function public.admin_submission_board(integer, text[], boolean, text) from public, anon, authenticated;
grant execute on function public.admin_submission_board(integer, text[], boolean, text) to service_role;
