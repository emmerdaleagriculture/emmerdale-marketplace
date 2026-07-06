-- ============================================================================
-- district_county_map: fill unitary-authority gaps.
--
-- These districts return admin_county = null from postcodes.io, so without a
-- map row their postcodes could never auto-resolve to a county:
--   Blackburn with Darwen → Lancashire
--   Blackpool             → Lancashire
--   Brighton and Hove     → East Sussex
-- (Verified against live postcodes.io ONS names, 2026-07-06.)
-- ============================================================================

insert into district_county_map (admin_district, county_id)
select d.admin_district, c.id
from (values
  ('Blackburn with Darwen','Lancashire'),
  ('Blackpool','Lancashire'),
  ('Brighton and Hove','East Sussex')
) as d(admin_district, county_name)
join counties c on c.name = d.county_name
on conflict (admin_district) do nothing;
