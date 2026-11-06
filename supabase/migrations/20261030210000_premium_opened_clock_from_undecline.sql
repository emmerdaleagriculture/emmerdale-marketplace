-- ============================================================================
-- The opened-job clock (20261030200000) restarts when a pass is withdrawn.
--
-- Un-passing keeps opened_at (20260926180000: the status goes back to
-- 'viewed' because the job was opened), so a member who passed at 09:10 and
-- changed their mind at 16:00 was instantly "opened and left" on the next
-- tick. The clock now runs from the later of the first view and the last
-- undecline, so they get the full sq_premium_opened_reply_hours again.
-- ============================================================================

create or replace function public.sq_premium_opened_unanswered(p_invitation_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
      from job_invitations ji
     where ji.id = p_invitation_id
       and ji.premium_offer
       and ji.status in ('sent', 'viewed')
       and ji.opened_at is not null
       and greatest(ji.opened_at,
                    coalesce((select max(e.created_at) from invitation_events e
                               where e.invitation_id = ji.id and e.event_type = 'undeclined'),
                             ji.opened_at))
             <= now() - make_interval(hours => app_config_num('sq_premium_opened_reply_hours', 6)::int)
       and not exists (select 1 from job_messages m
                        where m.invitation_id = ji.id
                          and m.sender = 'contractor')
  )
$function$;
