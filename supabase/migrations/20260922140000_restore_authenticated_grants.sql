-- ════════════════════════════════════════════════════════════════════════
-- Put back the two grants 20260922130000 should not have taken away.
--
-- That migration swept EXECUTE from anon AND authenticated across every
-- SECURITY DEFINER function in public, on the stated premise that "no browser
-- code calls any of these — every .rpc( call site in src/ runs server-side on
-- createServiceRoleClient()". That premise was wrong, and wrong because of
-- how it was checked: the grep that produced it piped through `sed 's/(.*//'`,
-- which truncates `src/app/(frontend)/…` at the bracket in the route group.
-- Every frontend call site collapsed to the string `src/app/` and the one
-- that mattered was invisible.
--
-- Two functions are called with a USER-SCOPED client (anon key + the
-- contractor's session), not service role:
--
--   open_job(uuid)             src/app/(frontend)/jobs/[id]/page.tsx:45
--                              `supabase.rpc('open_job', …)` where supabase =
--                              await createClient(). Granted deliberately in
--                              20260725120000 and again in 20260725140000.
--                              Opening the page IS the tracked contact
--                              reveal, so losing it loses the audit too.
--
--   is_active_subscriber(uuid) called from inside the body of the public_jobs
--                              view (20260725120000), which authenticated
--                              reads directly. security_invoker = false
--                              substitutes the view owner for RELATION
--                              privilege checks only — function EXECUTE is
--                              still checked against the invoking role — so
--                              the whole contractor job board failed with
--                              "permission denied for function
--                              is_active_subscriber".
--
-- Verified broken before this ran, as the role itself:
--   set local role authenticated; select count(*) from public_jobs;
--     ERROR: permission denied for function is_active_subscriber
--   set local role authenticated; select * from open_job('…'::uuid);
--     ERROR: permission denied for function open_job
--
-- anon stays revoked on both: neither is reachable without a session, and the
-- job board is contractor-only.
-- ════════════════════════════════════════════════════════════════════════

grant execute on function open_job(uuid) to authenticated;
grant execute on function is_active_subscriber(uuid) to authenticated;

-- ── The default-privilege fix, finished ─────────────────────────────────
-- 20260922130000 ran `alter default privileges in schema public revoke
-- execute on functions from anon, authenticated` with no FOR ROLE, so it only
-- altered the default ACL owned by the role running the migration (postgres).
-- That file's own header notes pg_default_acl carries entries for TWO
-- grantors. The supabase_admin entry survived, so anything created under that
-- role — dashboard DDL, an extension — is still auto-granted EXECUTE to anon,
-- which is the hole 20260922130000 exists to close.
--
-- Harmless if the role cannot be altered from here; the postgres-owned entry
-- is the one our own migrations create functions under.
-- …except it cannot be done from here, and not from the dashboard either.
-- ALTER DEFAULT PRIVILEGES FOR ROLE requires membership of that role, and on
-- this project `postgres` is neither a superuser nor a member of
-- supabase_admin (pg_auth_members: anon, authenticated, service_role,
-- authenticator, supabase_privileged_role, and the pg_* built-ins — not
-- supabase_admin). The dashboard SQL editor is the same postgres role. Only
-- Supabase support can change that entry. Attempted anyway so the notice
-- records the fact rather than the intention being lost.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public '
       || 'revoke execute on functions from anon, authenticated';
exception when insufficient_privilege or undefined_object then
  raise notice 'could not alter default privileges for supabase_admin (%), '
               'postgres-owned default still fixed', sqlerrm;
end $$;


-- ── Detection, since prevention is not fully available ──────────────────
-- The supabase_admin default ACL survives, so a function created under that
-- role — dashboard DDL, an extension — is still auto-granted EXECUTE to anon.
-- Nothing we can do stops that happening; this makes it visible the next time
-- an operator opens /admin/ops, instead of waiting for someone to think to
-- run the audit query by hand.
--
-- Returns one row per SECURITY DEFINER function in public that anon can
-- execute. The correct contents of this list is nothing at all.
create or replace function public.anon_exposed_functions()
 returns table (fn text)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and p.prorettype <> 'pg_catalog.trigger'::regtype
     and has_function_privilege('anon', p.oid, 'execute')
   order by 1;
$function$;

revoke execute on function anon_exposed_functions() from public, anon, authenticated;
grant execute on function anon_exposed_functions() to service_role;
