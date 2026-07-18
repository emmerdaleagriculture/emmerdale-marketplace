-- ============================================================================
-- Add a "Hay, straw & haylage" service so hay enquiries published from the
-- leads queue can be tagged for the contractors who make and supply it.
-- Matching is county-based, so this is a display/label category.
-- ============================================================================
insert into services (id, name)
values (16, 'Hay, straw & haylage')
on conflict (id) do nothing;

-- Keep the serial sequence ahead of the explicit ids seeded so far.
select setval(pg_get_serial_sequence('services', 'id'), (select max(id) from services));
