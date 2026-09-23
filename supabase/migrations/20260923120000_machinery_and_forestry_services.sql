-- ============================================================================
-- Seven new services, and every contractor ticked for all of them.
--
-- Tom's call (2026-09-23): contractors default to ON for every service. The
-- same day, all 178 existing contractors were set to every service by a
-- one-off update (their previous ticks are backed up outside the repo), and
-- onboarding now starts with everything ticked. So a new row lands already
-- ticked for everyone — which also keeps the old rule that a service nobody
-- has ticked must never exist.
--
-- area_priced: only the two forestry jobs are priced off ground area.
-- Road work is per metre of track; the tractor, trailer and excavator work
-- is by the hour, day or load. All are unit-priced, like Fencing.
--
-- listed = true: every contractor now covers them, so they belong on the
-- customer-facing service strips.
-- ============================================================================

insert into services (name, area_priced, listed) values
  ('General tractor work',     false, true),
  ('Trailer work',             false, true),
  ('Road grading',             false, true),
  ('Fixed tooth mulching',     true,  true),
  ('Excavator work',           false, true),
  ('Road construction/repair', false, true),
  ('Mounding',                 true,  true)
on conflict (name) do nothing;

update contractors
   set services = (select array_agg(id order by id) from services)
 where not (services @> (select array_agg(id) from services));
