-- ============================================================================
-- Coverage counts that say what they count.
--
-- county_coverage fed the public map, the home page's "N of 99 counties" and
-- every "N contractors cover <county>" line. It counted every approved
-- contractor with the county ticked — including the nationwide hay and straw
-- supplier, who is services_only and takes no paddock work. With him in,
-- every county read as covered the day Northern Ireland was added, with
-- nobody there to top a field. He is now excluded: general coverage means a
-- contractor who takes general work.
--
-- county_service_coverage is the per-service equivalent for the hay and
-- tractor-hire county pages, whose index/noindex gate and "N contractors"
-- line had been using the general count — a tractor-hire page in Belfast
-- claiming a contractor who sells straw. Counted in SQL, like county_coverage
-- (20260926200000), because the API caps a response at 1000 rows.
-- ============================================================================
create or replace view public.county_coverage as
  select c.name, count(k.id)::integer as contractors
  from counties c
  left join contractor_counties cc on cc.county_id = c.id
  left join contractors k
    on k.id = cc.contractor_id
   and k.status = 'approved'
   and not coalesce(k.services_only, false)
  group by c.name;

create or replace view public.county_service_coverage as
  select c.name, s.id as service_id, count(k.id)::integer as contractors
  from counties c
  cross join services s
  left join contractor_counties cc on cc.county_id = c.id
  left join contractors k
    on k.id = cc.contractor_id
   and k.status = 'approved'
   and s.id = any(k.services)
  group by c.name, s.id;

-- Contractor rows are not world-readable and neither are counts of them.
revoke all on public.county_coverage from anon, authenticated;
revoke all on public.county_service_coverage from anon, authenticated;
grant select on public.county_service_coverage to service_role;
