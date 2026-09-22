-- ════════════════════════════════════════════════════════════════════════
-- Close the SECURITY DEFINER functions to anon and authenticated.
--
-- FOUND 2026-09-22, live on production. Every migration since 20260901 has
-- ended with `revoke execute on function … from public`, with a comment
-- explaining that a fresh function is EXECUTE-to-PUBLIC by default and that
-- leaving it so would put a SECURITY DEFINER write within reach of anon
-- through PostgREST. The reasoning was right; the remedy was not.
--
-- This database carries ALTER DEFAULT PRIVILEGES entries (pg_default_acl,
-- grantors postgres and supabase_admin, objtype 'f') that grant EXECUTE on
-- newly created functions in schema public to anon and authenticated
-- *directly*, not through PUBLIC. Revoking from PUBLIC therefore removed a
-- grant that was doing nothing and left the two that mattered.
--
-- Proven rather than assumed: an unauthenticated POST to
-- /rest/v1/rpc/app_config_num carrying only the publishable anon key — the
-- one that ships in the browser bundle — returned 0.10, the value of
-- sq_markup_rate. That is the markup the whole sealed-quote design exists to
-- keep from the customer. 26 SECURITY DEFINER functions were reachable the
-- same way, among them mark_submission_completed, distribute_submission,
-- confirm_completion_by_client (which opens the balance charge),
-- award_submission, open_due_jobs, sealed_quote_tick and sq_notify_once —
-- the last taking an arbitrary recipient address and payload.
--
-- Safe to revoke wholesale: no browser code calls any of these. Every
-- `.rpc(` call site in src/ runs server-side on createServiceRoleClient().
-- Trigger functions are excluded — PostgreSQL checks EXECUTE on those at
-- CREATE TRIGGER time, and revoking here would not stop them firing, but
-- there is no reason to touch them either.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  fn record;
  n int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef                              -- SECURITY DEFINER only
       and p.prorettype <> 'pg_catalog.trigger'::regtype
       and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
    n := n + 1;
  end loop;
  raise notice 'revoked execute from anon/authenticated on % security-definer functions', n;
end $$;

-- Stop the next migration reopening it. These entries are what granted anon
-- EXECUTE on every new function in the first place; without this, the very
-- next `create function` in schema public is exposed again and the author
-- has to remember a revoke that looks redundant.
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- service_role is how the application reaches these; make sure the sweep
-- above (which revokes from anon/authenticated only) left it intact, and
-- restore it for anything that had been relying on a PUBLIC grant.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       and p.prorettype <> 'pg_catalog.trigger'::regtype
       and not has_function_privilege('service_role', p.oid, 'execute')
  loop
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end $$;
