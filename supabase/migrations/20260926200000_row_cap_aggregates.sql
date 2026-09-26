-- Two counts that were being done in JavaScript over rows PostgREST caps.
--
-- The hosted API returns at most 1000 rows per response whatever the client
-- asks for — a `.limit(10000)` and a Range header of 0-1999 both came back
-- with 1000 (measured 2026-09-26). So anything that pulled a table into the
-- app to count it started lying the day the table passed 1000 rows:
--
--   - contractor_counties (1172 approved rows) fed the public coverage map,
--     the county SEO pages and the sitemap's "only covered counties" rule.
--     85 of 88 counties were under-counted; North Yorkshire showed 21 of 26.
--   - pending_emails (1471 rows) fed /admin/email's pending / failed / sent
--     this week / oldest waiting, computed from an arbitrary 1000 of them.
--
-- A count is SQL's job. The row readers that genuinely need rows (the page
-- event analytics) now page through in 1000s instead — see fetchAll.

-- ── Approved contractors per county ─────────────────────────────────────
-- Same definition getCountyCoverage always used: approved, vetting aside.
create or replace view county_coverage as
  select c.name,
         count(k.id)::int as contractors
    from counties c
    left join contractor_counties cc on cc.county_id = c.id
    left join contractors k on k.id = cc.contractor_id and k.status = 'approved'
   group by c.name;

revoke all on county_coverage from public, anon, authenticated;
grant select on county_coverage to service_role;

-- ── The email queue in five numbers ─────────────────────────────────────
-- A row held back by send_after is a delivery retry waiting out its delay —
-- parked, not stuck — so it is counted apart from pending, exactly as the
-- page did in JavaScript.
create or replace function email_queue_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pending',   count(*) filter (where status = 'pending'
                                    and (send_after is null or send_after <= now())),
    'held',      count(*) filter (where status = 'pending' and send_after > now()),
    'failed',    count(*) filter (where status = 'failed'),
    'sent_week', count(*) filter (where status = 'sent'
                                    and created_at >= now() - interval '7 days'),
    'oldest_pending', min(created_at) filter (where status = 'pending'
                                    and (send_after is null or send_after <= now()))
  )
  from pending_emails;
$$;

revoke all on function email_queue_counts() from public, anon, authenticated;
grant execute on function email_queue_counts() to service_role;
