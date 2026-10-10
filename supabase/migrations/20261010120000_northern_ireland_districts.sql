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

-- Which traditional counties each district covers, shown under its name in
-- the county picker the same way the Welsh preserved counties list their
-- modern areas: people in Northern Ireland think in the six counties, and a
-- contractor in Tyrone needs to know that "Mid Ulster" and "Fermanagh and
-- Omagh" are both theirs.
update counties set covers = 'Co. Antrim'                            where name = 'Antrim and Newtownabbey';
update counties set covers = 'Co. Down'                              where name = 'Ards and North Down';
update counties set covers = 'Co. Armagh & west Down'                where name = 'Armagh City, Banbridge and Craigavon';
update counties set covers = 'The city, both sides of the Lagan'     where name = 'Belfast';
update counties set covers = 'North Antrim & north Londonderry'      where name = 'Causeway Coast and Glens';
update counties set covers = 'Co. Londonderry & north-west Tyrone'   where name = 'Derry City and Strabane';
update counties set covers = 'Co. Fermanagh & west Tyrone'           where name = 'Fermanagh and Omagh';
update counties set covers = 'South Antrim & north Down'             where name = 'Lisburn and Castlereagh';
update counties set covers = 'Co. Antrim'                            where name = 'Mid and East Antrim';
update counties set covers = 'East Tyrone & south Londonderry'       where name = 'Mid Ulster';
update counties set covers = 'South Down & south Armagh'             where name = 'Newry, Mourne and Down';

-- A nationwide contractor is encoded as every county plus a 1000-mile invite
-- radius (services_only hay and straw, set up 2026-10-09). "Every county" was
-- a snapshot of the table at the time, so a new region silently falls outside
-- it; extend them here, as any future region must.
insert into contractor_counties (contractor_id, county_id)
  select c.id, co.id
  from contractors c cross join counties co
  where c.invite_radius_miles >= 1000 and co.region = 'Northern Ireland'
on conflict do nothing;

-- Keep the serial sequence ahead of the explicit ids.
select setval(pg_get_serial_sequence('counties', 'id'), (select max(id) from counties));
