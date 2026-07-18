-- ============================================================================
-- Add Scotland to the location taxonomy. Scotland's county-equivalents are its
-- 32 council areas (unitary authorities). postcodes.io returns the council area
-- in `admin_district` (admin_county is null for Scotland), so each also needs a
-- district_county_map row keyed on the exact council-area name for postcode
-- resolution to work. Grouped under region 'Scotland'.
-- ============================================================================
insert into counties (id, name, region, country) values
  (57, 'Aberdeen City',           'Scotland', 'Scotland'),
  (58, 'Aberdeenshire',           'Scotland', 'Scotland'),
  (59, 'Angus',                   'Scotland', 'Scotland'),
  (60, 'Argyll and Bute',         'Scotland', 'Scotland'),
  (61, 'City of Edinburgh',       'Scotland', 'Scotland'),
  (62, 'Clackmannanshire',        'Scotland', 'Scotland'),
  (63, 'Dumfries and Galloway',   'Scotland', 'Scotland'),
  (64, 'Dundee City',             'Scotland', 'Scotland'),
  (65, 'East Ayrshire',           'Scotland', 'Scotland'),
  (66, 'East Dunbartonshire',     'Scotland', 'Scotland'),
  (67, 'East Lothian',            'Scotland', 'Scotland'),
  (68, 'East Renfrewshire',       'Scotland', 'Scotland'),
  (69, 'Falkirk',                 'Scotland', 'Scotland'),
  (70, 'Fife',                    'Scotland', 'Scotland'),
  (71, 'Glasgow City',            'Scotland', 'Scotland'),
  (72, 'Highland',                'Scotland', 'Scotland'),
  (73, 'Inverclyde',              'Scotland', 'Scotland'),
  (74, 'Midlothian',              'Scotland', 'Scotland'),
  (75, 'Moray',                   'Scotland', 'Scotland'),
  (76, 'Na h-Eileanan Siar',      'Scotland', 'Scotland'),
  (77, 'North Ayrshire',          'Scotland', 'Scotland'),
  (78, 'North Lanarkshire',       'Scotland', 'Scotland'),
  (79, 'Orkney Islands',          'Scotland', 'Scotland'),
  (80, 'Perth and Kinross',       'Scotland', 'Scotland'),
  (81, 'Renfrewshire',            'Scotland', 'Scotland'),
  (82, 'Scottish Borders',        'Scotland', 'Scotland'),
  (83, 'Shetland Islands',        'Scotland', 'Scotland'),
  (84, 'South Ayrshire',          'Scotland', 'Scotland'),
  (85, 'South Lanarkshire',       'Scotland', 'Scotland'),
  (86, 'Stirling',                'Scotland', 'Scotland'),
  (87, 'West Dunbartonshire',     'Scotland', 'Scotland'),
  (88, 'West Lothian',            'Scotland', 'Scotland')
on conflict (id) do nothing;

-- Map each council area (postcodes.io admin_district) to its county row.
insert into district_county_map (admin_district, county_id)
  select name, id from counties where region = 'Scotland'
on conflict (admin_district) do nothing;

-- Keep the serial sequence ahead of the explicit ids.
select setval(pg_get_serial_sequence('counties', 'id'), (select max(id) from counties));
