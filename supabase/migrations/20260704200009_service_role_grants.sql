-- ============================================================================
-- Grant execute on service-invoked functions to service_role.
--
-- Migration 200005/200008 revoked execute on these from PUBLIC (correct — they
-- must not be callable by anon/authenticated). But the admin routes call them
-- through the service-role client, so service_role needs an explicit grant.
-- (Cron calls open/close as the function owner, so those don't strictly need
-- this, but granting is harmless and makes service-role invocation possible.)
-- ============================================================================

grant execute on function award_job(uuid, uuid)  to service_role;
grant execute on function notify_job_open(uuid)   to service_role;
grant execute on function open_due_jobs()         to service_role;
grant execute on function close_due_jobs()        to service_role;
