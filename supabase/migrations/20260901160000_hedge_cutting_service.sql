-- ============================================================================
-- Service 18: Hedge cutting.
--
-- Live parse data said it plainly: a customer wrote "hedge cutting" and the
-- parser forced it into Flailing — which Tom confirms is a different job.
-- Exactly the taxonomy-gap signal the confirm step exists to surface (spec
-- §4). Hedge work is linear (priced per metre, not per acre), so it is not
-- area-priced: no mandatory field boundary, no £/acre rate option.
--
-- Existing contractors get it appended (same backfill-then-narrow decision
-- as the original service backfill); they can untick it in their account.
-- ============================================================================

-- The sequence lags the explicitly-numbered seed rows (16, 17) — advance it
-- before inserting or nextval collides with an existing id.
select setval(
  pg_get_serial_sequence('services', 'id'),
  greatest((select max(id) from services), 1)
);

insert into services (name, area_priced) values ('Hedge cutting', false)
on conflict (name) do nothing;

update contractors
   set services = array_append(services, (select id from services where name = 'Hedge cutting'))
 where not (select id from services where name = 'Hedge cutting') = any(services);
