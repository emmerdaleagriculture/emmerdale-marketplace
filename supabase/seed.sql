-- ============================================================================
-- Seed data (spec §2, §3). Idempotent — safe to re-run.
--
-- counties:  ceremonial counties of England (48) + preserved counties of Wales (8).
-- services:  the confirmed 15.
-- district_county_map: unitary authority / metropolitan district / London borough
--   → ceremonial county, for postcodes where postcodes.io returns admin_county = null.
--
-- NOTE ON DISTRICT NAMES: keys must match the `admin_district` string postcodes.io
-- returns (ONS names, e.g. 'Bristol, City of'). The high-value southern mappings
-- and the acceptance-test cases (Bournemouth,Christchurch and Poole→Dorset;
-- Southampton→Hampshire; Swindon→Wiltshire) are verified; validate the long tail
-- against live postcodes.io responses before launch. The manual-fallback in
-- resolveCounty() (spec §2.2 step 3) covers any gap safely.
-- ============================================================================

-- ── Services (15) ───────────────────────────────────────────────────────────
insert into services (name) values
  ('Paddock topping'), ('Flailing'), ('Flail collecting'), ('Finish mowing'),
  ('Harrowing'), ('Rolling'), ('Rotavating'), ('Mole ploughing'),
  ('Stone burying'), ('Land & ditch clearance'), ('Weed control'), ('Spraying'),
  ('Fertiliser application'), ('Overseeding'), ('Manure sweeping')
on conflict (name) do nothing;

-- ── Counties: England (48 ceremonial) ───────────────────────────────────────
insert into counties (name, region, country) values
  ('Berkshire','South East','England'),
  ('Buckinghamshire','South East','England'),
  ('East Sussex','South East','England'),
  ('Hampshire','South East','England'),
  ('Isle of Wight','South East','England'),
  ('Kent','South East','England'),
  ('Oxfordshire','South East','England'),
  ('Surrey','South East','England'),
  ('West Sussex','South East','England'),
  ('Bristol','South West','England'),
  ('Cornwall','South West','England'),
  ('Devon','South West','England'),
  ('Dorset','South West','England'),
  ('Gloucestershire','South West','England'),
  ('Somerset','South West','England'),
  ('Wiltshire','South West','England'),
  ('Greater London','London','England'),
  ('City of London','London','England'),
  ('Bedfordshire','East of England','England'),
  ('Cambridgeshire','East of England','England'),
  ('Essex','East of England','England'),
  ('Hertfordshire','East of England','England'),
  ('Norfolk','East of England','England'),
  ('Suffolk','East of England','England'),
  ('Derbyshire','East Midlands','England'),
  ('Leicestershire','East Midlands','England'),
  ('Lincolnshire','East Midlands','England'),
  ('Northamptonshire','East Midlands','England'),
  ('Nottinghamshire','East Midlands','England'),
  ('Rutland','East Midlands','England'),
  ('Herefordshire','West Midlands','England'),
  ('Shropshire','West Midlands','England'),
  ('Staffordshire','West Midlands','England'),
  ('Warwickshire','West Midlands','England'),
  ('West Midlands','West Midlands','England'),
  ('Worcestershire','West Midlands','England'),
  ('Cheshire','North West','England'),
  ('Cumbria','North West','England'),
  ('Greater Manchester','North West','England'),
  ('Lancashire','North West','England'),
  ('Merseyside','North West','England'),
  ('County Durham','North East','England'),
  ('Northumberland','North East','England'),
  ('Tyne and Wear','North East','England'),
  ('East Riding of Yorkshire','Yorkshire and the Humber','England'),
  ('North Yorkshire','Yorkshire and the Humber','England'),
  ('South Yorkshire','Yorkshire and the Humber','England'),
  ('West Yorkshire','Yorkshire and the Humber','England')
on conflict (name) do nothing;

-- ── Counties: Wales (8 preserved) ───────────────────────────────────────────
insert into counties (name, region, country) values
  ('Clwyd','Wales','Wales'),
  ('Dyfed','Wales','Wales'),
  ('Gwent','Wales','Wales'),
  ('Gwynedd','Wales','Wales'),
  ('Mid Glamorgan','Wales','Wales'),
  ('Powys','Wales','Wales'),
  ('South Glamorgan','Wales','Wales'),
  ('West Glamorgan','Wales','Wales')
on conflict (name) do nothing;

-- ── district_county_map ─────────────────────────────────────────────────────
-- Insert by county name so we never hardcode serial ids.
insert into district_county_map (admin_district, county_id)
select d.admin_district, c.id
from (values
  -- Bedfordshire
  ('Bedford','Bedfordshire'),
  ('Central Bedfordshire','Bedfordshire'),
  ('Luton','Bedfordshire'),
  -- Berkshire
  ('Bracknell Forest','Berkshire'),
  ('Reading','Berkshire'),
  ('Slough','Berkshire'),
  ('West Berkshire','Berkshire'),
  ('Windsor and Maidenhead','Berkshire'),
  ('Wokingham','Berkshire'),
  -- Bristol
  ('Bristol, City of','Bristol'),
  -- Buckinghamshire
  ('Buckinghamshire','Buckinghamshire'),
  ('Milton Keynes','Buckinghamshire'),
  -- Cambridgeshire
  ('Peterborough','Cambridgeshire'),
  -- Cheshire
  ('Cheshire East','Cheshire'),
  ('Cheshire West and Chester','Cheshire'),
  ('Halton','Cheshire'),
  ('Warrington','Cheshire'),
  -- Cornwall
  ('Cornwall','Cornwall'),
  ('Isles of Scilly','Cornwall'),
  -- Cumbria (2023 unitaries)
  ('Cumberland','Cumbria'),
  ('Westmorland and Furness','Cumbria'),
  -- Derbyshire
  ('Derby','Derbyshire'),
  -- Devon
  ('Plymouth','Devon'),
  ('Torbay','Devon'),
  -- Dorset (acceptance #2)
  ('Bournemouth, Christchurch and Poole','Dorset'),
  ('Dorset','Dorset'),
  -- County Durham
  ('County Durham','County Durham'),
  ('Darlington','County Durham'),
  ('Hartlepool','County Durham'),
  ('Stockton-on-Tees','County Durham'),
  -- East Riding of Yorkshire
  ('East Riding of Yorkshire','East Riding of Yorkshire'),
  ('Kingston upon Hull, City of','East Riding of Yorkshire'),
  -- Essex
  ('Southend-on-Sea','Essex'),
  ('Thurrock','Essex'),
  -- Gloucestershire
  ('South Gloucestershire','Gloucestershire'),
  -- Hampshire (acceptance #1 unitary case)
  ('Portsmouth','Hampshire'),
  ('Southampton','Hampshire'),
  -- Herefordshire
  ('Herefordshire, County of','Herefordshire'),
  -- Isle of Wight
  ('Isle of Wight','Isle of Wight'),
  -- Kent
  ('Medway','Kent'),
  -- Leicestershire
  ('Leicester','Leicestershire'),
  -- Lincolnshire
  ('North Lincolnshire','Lincolnshire'),
  ('North East Lincolnshire','Lincolnshire'),
  -- Northamptonshire
  ('North Northamptonshire','Northamptonshire'),
  ('West Northamptonshire','Northamptonshire'),
  -- Nottinghamshire
  ('Nottingham','Nottinghamshire'),
  -- Rutland
  ('Rutland','Rutland'),
  -- Shropshire
  ('Shropshire','Shropshire'),
  ('Telford and Wrekin','Shropshire'),
  -- Somerset (2023 unitary + N Somerset + BANES)
  ('Somerset','Somerset'),
  ('North Somerset','Somerset'),
  ('Bath and North East Somerset','Somerset'),
  -- Staffordshire
  ('Stoke-on-Trent','Staffordshire'),
  -- Wiltshire (acceptance implied: Swindon→Wiltshire)
  ('Swindon','Wiltshire'),
  ('Wiltshire','Wiltshire'),
  -- North Yorkshire (2023 unitary + York + Tees-side ceremonial)
  ('North Yorkshire','North Yorkshire'),
  ('York','North Yorkshire'),
  ('Middlesbrough','North Yorkshire'),
  ('Redcar and Cleveland','North Yorkshire'),
  -- Northumberland
  ('Northumberland','Northumberland'),
  -- Greater Manchester (metropolitan districts)
  ('Bolton','Greater Manchester'), ('Bury','Greater Manchester'),
  ('Manchester','Greater Manchester'), ('Oldham','Greater Manchester'),
  ('Rochdale','Greater Manchester'), ('Salford','Greater Manchester'),
  ('Stockport','Greater Manchester'), ('Tameside','Greater Manchester'),
  ('Trafford','Greater Manchester'), ('Wigan','Greater Manchester'),
  -- Merseyside
  ('Knowsley','Merseyside'), ('Liverpool','Merseyside'), ('Sefton','Merseyside'),
  ('St. Helens','Merseyside'), ('Wirral','Merseyside'),
  -- South Yorkshire
  ('Barnsley','South Yorkshire'), ('Doncaster','South Yorkshire'),
  ('Rotherham','South Yorkshire'), ('Sheffield','South Yorkshire'),
  -- Tyne and Wear
  ('Gateshead','Tyne and Wear'), ('Newcastle upon Tyne','Tyne and Wear'),
  ('North Tyneside','Tyne and Wear'), ('South Tyneside','Tyne and Wear'),
  ('Sunderland','Tyne and Wear'),
  -- West Midlands
  ('Birmingham','West Midlands'), ('Coventry','West Midlands'),
  ('Dudley','West Midlands'), ('Sandwell','West Midlands'),
  ('Solihull','West Midlands'), ('Walsall','West Midlands'),
  ('Wolverhampton','West Midlands'),
  -- West Yorkshire
  ('Bradford','West Yorkshire'), ('Calderdale','West Yorkshire'),
  ('Kirklees','West Yorkshire'), ('Leeds','West Yorkshire'),
  ('Wakefield','West Yorkshire'),
  -- City of London
  ('City of London','City of London'),
  -- Greater London boroughs
  ('Barking and Dagenham','Greater London'), ('Barnet','Greater London'),
  ('Bexley','Greater London'), ('Brent','Greater London'),
  ('Bromley','Greater London'), ('Camden','Greater London'),
  ('Croydon','Greater London'), ('Ealing','Greater London'),
  ('Enfield','Greater London'), ('Greenwich','Greater London'),
  ('Hackney','Greater London'), ('Hammersmith and Fulham','Greater London'),
  ('Haringey','Greater London'), ('Harrow','Greater London'),
  ('Havering','Greater London'), ('Hillingdon','Greater London'),
  ('Hounslow','Greater London'), ('Islington','Greater London'),
  ('Kensington and Chelsea','Greater London'), ('Kingston upon Thames','Greater London'),
  ('Lambeth','Greater London'), ('Lewisham','Greater London'),
  ('Merton','Greater London'), ('Newham','Greater London'),
  ('Redbridge','Greater London'), ('Richmond upon Thames','Greater London'),
  ('Southwark','Greater London'), ('Sutton','Greater London'),
  ('Tower Hamlets','Greater London'), ('Waltham Forest','Greater London'),
  ('Wandsworth','Greater London'), ('Westminster','Greater London'),
  -- Wales: Clwyd
  ('Denbighshire','Clwyd'), ('Flintshire','Clwyd'), ('Wrexham','Clwyd'),
  ('Conwy','Clwyd'),
  -- Wales: Dyfed
  ('Carmarthenshire','Dyfed'), ('Ceredigion','Dyfed'), ('Pembrokeshire','Dyfed'),
  -- Wales: Gwent
  ('Blaenau Gwent','Gwent'), ('Caerphilly','Gwent'), ('Monmouthshire','Gwent'),
  ('Newport','Gwent'), ('Torfaen','Gwent'),
  -- Wales: Gwynedd
  ('Gwynedd','Gwynedd'), ('Isle of Anglesey','Gwynedd'),
  -- Wales: Mid Glamorgan
  ('Bridgend','Mid Glamorgan'), ('Merthyr Tydfil','Mid Glamorgan'),
  ('Rhondda Cynon Taf','Mid Glamorgan'),
  -- Wales: Powys
  ('Powys','Powys'),
  -- Wales: South Glamorgan
  ('Cardiff','South Glamorgan'), ('Vale of Glamorgan','South Glamorgan'),
  -- Wales: West Glamorgan
  ('Neath Port Talbot','West Glamorgan'), ('Swansea','West Glamorgan')
) as d(admin_district, county_name)
join counties c on c.name = d.county_name
on conflict (admin_district) do nothing;
