-- ============================================================================
-- /admin/submissions: one row per submission with its outreach numbers.
--
-- The page listed submissions and nothing about what happened to them. Per job
-- it now shows the invitation emails sent / delivered / failed, how many
-- contractors opened the job, priced it or declined, and what the customer
-- has been shown. Counting that in the page would pull every invitation and
-- email row through PostgREST's 1,000-row cap, so it is aggregated here.
--
-- "Opened" is the contractor opening the job page from the email
-- (job_invitations.opened_at). Pixel opens are not tracked (email-events
-- ignores email.opened), and would mostly be Apple Mail prefetch anyway.
--
-- Priced / declined read contractor_quotes and decline_reason rather than
-- job_invitations.status, which expiry and award overwrite with
-- closed_stale / closed_awarded.
-- ============================================================================

create index if not exists pending_emails_sq_invitation_submission_idx
  on pending_emails ((payload->>'submission_id'))
  where kind = 'sq_invitation';

create or replace function admin_submission_board(p_limit int default 200) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc), '[]'::jsonb)
  from (
    select js.id, js.created_at, js.status, js.raw_text, js.service_verbatim,
           js.area_value, js.area_unit, js.area_mapped_value, js.postcode,
           js.urgency, js.target_date,
           js.contact_name, js.contact_phone, js.contact_email,
           js.utm_source, js.utm_campaign,
           js.confirmed_at, js.distributed_at, js.expires_at, js.awarded_at,
           cardinality(js.photo_paths) as photos,
           s.name  as service,
           c.name  as county,
           aw.business_name as awarded_to,
           inv.invited, inv.opened, inv.priced, inv.declined,
           em.sent as emails_sent, em.delivered as emails_delivered, em.failed as emails_failed,
           cq.live as quotes_live, cq.lowest as lowest_client_pence
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
               min(q.client_price_pence) filter (where q.status in ('active','accepted')) as lowest
          from client_quotes q
         where q.submission_id = js.id
      ) cq on true
     order by js.created_at desc
     limit p_limit
  ) b;
$$;

revoke execute on function admin_submission_board(int) from public, anon, authenticated;
grant execute on function admin_submission_board(int) to service_role;
