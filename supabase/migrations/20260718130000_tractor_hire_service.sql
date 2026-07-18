-- ============================================================================
-- Add a "Tractor hire (events)" service so tractor-hire enquiries published from
-- the leads queue can be tagged for the operators who fulfil them. Matching is
-- county-based, so this is a display/label category.
-- ============================================================================
insert into services (id, name)
values (17, 'Tractor hire (events)')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('services', 'id'), (select max(id) from services));
