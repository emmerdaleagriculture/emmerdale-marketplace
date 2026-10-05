-- Suspension closes a contractor's threads in the one place every thread
-- question is answered. Before this the unread-message reminder, held-message
-- approval alerts, site visits and the weekly digest all still treated a
-- suspended contractor's threads as live. Body is the live definition
-- (pg_get_functiondef) plus the suspended branch and the contractors join.

CREATE OR REPLACE FUNCTION public.sq_thread_state(p_invitation_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    -- A suspended contractor's threads are closed everywhere: no reminders,
    -- no alerts on approval, no visits, nothing in the digest (20261005210000).
    when ct.status = 'suspended'
      then 'closed'
    when js.status in ('distributed', 'quotes_receiving', 'accepted_awaiting_payment')
     and ji.status in ('sent', 'viewed', 'priced')
      then 'pre_award'
    when js.awarded_contractor_id = ji.contractor_id
     and js.status in ('awarded', 'contacted', 'scheduled', 'in_progress',
                       'completed_by_contractor', 'completed', 'paid',
                       -- A dispute or a changed job is when they most need to talk.
                       'variation_pending', 'variation_declined', 'disputed')
      then 'post_award'
    else 'closed'
  end
  from job_invitations ji
  join job_submissions js on js.id = ji.submission_id
  join contractors ct on ct.id = ji.contractor_id
  where ji.id = p_invitation_id
$function$;
