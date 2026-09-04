-- ============================================================================
-- Expose the email drain's own health to the admin.
--
-- pg_cron calls send-emails through pg_net every minute, and the outcome lands
-- in net._http_response — a schema PostgREST does not expose, so the app can't
-- read it. During the platform migration "is the drain actually reaching the
-- function?" had to be answered with psql every time, and the answer is the
-- difference between "no mail is due" and "no mail can send".
--
-- A queue with nothing in it looks identical whether the drain is healthy or
-- dead, which is exactly why this needs its own signal rather than being
-- inferred from pending_emails.
-- ============================================================================

create or replace function public.email_drain_health(p_limit int default 5)
returns table (status_code int, body text, called_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.status_code,
         left(coalesce(r.content, ''), 200),
         r.created
    from net._http_response r
   order by r.created desc
   limit greatest(1, least(coalesce(p_limit, 5), 50));
$$;

revoke execute on function public.email_drain_health(int) from public, anon, authenticated;
grant execute on function public.email_drain_health(int) to service_role;
