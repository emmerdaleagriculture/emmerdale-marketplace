-- ============================================================================
-- Add Northern Ireland to the location taxonomy. Its county-equivalents are
-- the 11 local government districts (2015 reform). As with Scotland,
-- postcodes.io returns the district in `admin_district` (admin_county is null
-- for every BT postcode), so each needs a district_county_map row keyed on the
-- exact ONS name for postcode resolution to work. Grouped under region
-- 'Northern Ireland'.
--
-- Districts rather than the six traditional counties because four of the
-- eleven straddle a county line (Armagh City, Banbridge and Craigavon;
-- Causeway Coast and Glens; Mid Ulster; Newry, Mourne and Down): a postcode
-- resolves to a district cleanly, but to a county only with a "which side?"
-- question, and that question would land on a third of Northern Ireland.
--
-- Nothing else changes: BT postcodes are UK postcodes, mobiles are 07…,
-- prices are sterling and the customer terms already cover Northern Ireland.
-- ============================================================================
insert into counties (id, name, region, country) values
  (89, 'Antrim and Newtownabbey',              'Northern Ireland', 'Northern Ireland'),
  (90, 'Ards and North Down',                  'Northern Ireland', 'Northern Ireland'),
  (91, 'Armagh City, Banbridge and Craigavon', 'Northern Ireland', 'Northern Ireland'),
  (92, 'Belfast',                              'Northern Ireland', 'Northern Ireland'),
  (93, 'Causeway Coast and Glens',             'Northern Ireland', 'Northern Ireland'),
  (94, 'Derry City and Strabane',              'Northern Ireland', 'Northern Ireland'),
  (95, 'Fermanagh and Omagh',                  'Northern Ireland', 'Northern Ireland'),
  (96, 'Lisburn and Castlereagh',              'Northern Ireland', 'Northern Ireland'),
  (97, 'Mid and East Antrim',                  'Northern Ireland', 'Northern Ireland'),
  (98, 'Mid Ulster',                           'Northern Ireland', 'Northern Ireland'),
  (99, 'Newry, Mourne and Down',               'Northern Ireland', 'Northern Ireland')
on conflict (id) do nothing;

-- Map each district (postcodes.io admin_district) to its county row.
insert into district_county_map (admin_district, county_id)
  select name, id from counties where region = 'Northern Ireland'
on conflict (admin_district) do nothing;

-- Keep the serial sequence ahead of the explicit ids.
select setval(pg_get_serial_sequence('counties', 'id'), (select max(id) from counties));
