-- ============================================================================
-- One read for the dashboard's Priority Access section: the standing of
-- the network tonight, what the shadow window says about the last 30 days
-- of jobs, and the site visits arranged in the messages. The detail is on
-- /admin/priority; this is the glance.
-- ============================================================================
create or replace function admin_priority_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with st as (select * from contractor_standing_latest),
  sh as (select * from priority_shadow where distributed_at > now() - interval '30 days'),
  v as (select * from thread_visits where created_at > now() - interval '30 days')
  select jsonb_build_object(
    'computed_on', (select max(computed_on) from st),
    'standing', jsonb_build_object(
      'priority',   (select count(*) from st where tier = 'priority'),
      'responsive', (select count(*) from st where tier = 'responsive'),
      'standard',   (select count(*) from st where tier = 'standard'),
      'watch',      (select count(*) from st where watch),
      'unclean',    (select count(*) from st where not clean),
      'contacting', (select count(*) from st where contacts > 0)),
    'flags_30d', (select count(*) from platform_flags where created_at > now() - interval '30 days'),
    'shadow', jsonb_build_object(
      'jobs',            (select count(*) from sh),
      'with_priority',   (select count(*) from sh where cardinality(priority_ids) > 0),
      'with_any',        (select count(*) from sh where cardinality(priority_ids) + cardinality(responsive_ids) > 0),
      'priced',          (select count(*) from sh where first_price_tier is not null),
      'first_from_tier', (select count(*) from sh where first_price_tier in ('priority', 'responsive')),
      'held_back',       (select count(*) from sh where first_price_delay_h > 0),
      'avg_delay_h',     (select round(avg(first_price_delay_h), 1) from sh where first_price_delay_h > 0),
      'standard_only',   (select count(*) from sh where first_price_tier is not null and prices_priority + prices_responsive = 0),
      'booked',          (select count(*) from sh where booked_tier is not null),
      'booked_from_tier',(select count(*) from sh where booked_tier in ('priority', 'responsive'))),
    'visits', jsonb_build_object(
      'proposed',  (select count(*) from v),
      'agreed',    (select count(*) from v where status in ('accepted', 'held', 'cancelled') and (status <> 'cancelled' or starts_at < decided_at)),
      'upcoming',  (select count(*) from v where status = 'accepted' and starts_at > now()),
      'held',      (select count(*) from v where status = 'held' or (status = 'accepted' and starts_at <= now())),
      'declined',  (select count(*) from v where status = 'declined'),
      'called_off',(select count(*) from v where status = 'cancelled'),
      -- A visit that took place and the job then booked with that contractor.
      'held_then_booked', (select count(*) from v join job_invitations ji on ji.id = v.invitation_id
                            join job_submissions js on js.id = v.submission_id
                           where (v.status = 'held' or (v.status = 'accepted' and v.starts_at <= now()))
                             and js.awarded_contractor_id = ji.contractor_id)),
    'generated_at', now())
$$;
revoke execute on function admin_priority_summary() from public, anon, authenticated;
grant  execute on function admin_priority_summary() to service_role;
