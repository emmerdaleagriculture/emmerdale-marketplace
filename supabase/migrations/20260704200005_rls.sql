-- ============================================================================
-- Row-Level Security (spec §3: "RLS throughout").
--
-- Model:
--   reference tables (counties, services)   → world-readable (signup UI)
--   district_county_map                      → service-role only (server resolves)
--   contractors / contractor_counties / bids / contact_reveals / subscriptions
--                                            → owner-only reads; writes via RPCs
--   jobs / job_notifications / pending_emails → sealed (service-role only)
--
-- The admin path uses the service-role key, which bypasses RLS entirely — so no
-- table needs an explicit "admin" policy. RLS is NOT forced, so security-definer
-- views/RPCs (owned by the migration role) can still read sealed tables.
-- ============================================================================

-- Enable RLS on every table.
alter table counties              enable row level security;
alter table district_county_map   enable row level security;
alter table services              enable row level security;
alter table contractors           enable row level security;
alter table contractor_counties   enable row level security;
alter table jobs                  enable row level security;
alter table bids                  enable row level security;
alter table contact_reveals       enable row level security;
alter table subscriptions         enable row level security;
alter table job_notifications     enable row level security;
alter table pending_emails        enable row level security;

-- ── Reference data ──────────────────────────────────────────────────────────
create policy counties_read  on counties  for select to anon, authenticated using (true);
create policy services_read  on services  for select to anon, authenticated using (true);
-- district_county_map: no policies → only service role can read it.

-- ── Contractors ─────────────────────────────────────────────────────────────
create policy contractors_select_own on contractors
  for select to authenticated using (id = auth.uid());
create policy contractors_insert_self on contractors
  for insert to authenticated with check (id = auth.uid());
create policy contractors_update_own on contractors
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- no delete policy → contractors are suspended, never deleted (acceptance #10).

-- ── Contractor counties ─────────────────────────────────────────────────────
create policy cc_select_own on contractor_counties
  for select to authenticated using (contractor_id = auth.uid());
create policy cc_insert_own on contractor_counties
  for insert to authenticated with check (contractor_id = auth.uid());
create policy cc_delete_own on contractor_counties
  for delete to authenticated using (contractor_id = auth.uid());

-- ── Bids ────────────────────────────────────────────────────────────────────
-- Read only your own bid (amounts are otherwise private). Writes go through
-- place_bid() (security definer), so no insert/update policy is granted here.
create policy bids_select_own on bids
  for select to authenticated using (contractor_id = auth.uid());

-- ── Contact reveals ─────────────────────────────────────────────────────────
-- See which jobs you've unlocked. Inserts happen only inside security-definer
-- RPCs (get_job_contact / award_job / close_due_jobs).
create policy reveals_select_own on contact_reveals
  for select to authenticated using (contractor_id = auth.uid());

-- ── Subscriptions ───────────────────────────────────────────────────────────
-- Read your own; writes are service-role only (Stripe webhooks).
create policy subs_select_own on subscriptions
  for select to authenticated using (contractor_id = auth.uid());

-- jobs, job_notifications, pending_emails: RLS enabled, no policies → no access
-- for anon/authenticated. Reached only via the views/RPCs and the service role.

-- ── Function execution grants ───────────────────────────────────────────────
-- Lock down by default, then grant only what each role legitimately calls.
revoke execute on function open_due_jobs()  from public;
revoke execute on function close_due_jobs() from public;
revoke execute on function award_job(uuid, uuid) from public;

grant select on public_jobs to authenticated;
grant execute on function get_job_contact(uuid)          to authenticated;
grant execute on function place_bid(uuid, int, text)     to authenticated;
grant execute on function is_active_subscriber(uuid)     to authenticated;
grant execute on function is_admin()                     to authenticated;
