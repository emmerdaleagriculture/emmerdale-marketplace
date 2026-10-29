-- How many contractors a postcode would actually reach.
--
-- The widget, /start and the confirm page can now say "41 contractors cover
-- SO51" the moment a postcode goes in. The figure has to be the one
-- distribute_submission would act on, or the page promises a market the job
-- never gets: the same county membership, the same approved-and-vetted gate,
-- the same per-contractor invite radius from base, and the same services_only
-- rule — a hay-only supplier is not a hedge-cutting contractor and is not
-- counted as one unless hay is what was asked for.
--
-- No allowlist clause on purpose: test mode narrows who is *emailed*, not who
-- covers an area, and a customer in test mode should still see the real
-- figure.
--
-- The service is matched by canonical name, not id, because the only caller
-- (the coverage route) starts from a front-page card slug and resolves it
-- through serviceFromPick; carrying the name keeps that mapping in one place.
create or replace function public.sq_coverage_count(
  p_county_id integer,
  p_lat numeric default null,
  p_lng numeric default null,
  p_service_name text default null)
 returns integer
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select count(*)::int
    from contractors ct
    join contractor_counties cc on cc.contractor_id = ct.id
   where cc.county_id = p_county_id
     and ct.status = 'approved'
     and ct.vetted_at is not null
     and sq_in_invite_range(p_lat, p_lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles)
     and (not coalesce(ct.services_only, false)
          or (p_service_name is not null
              and exists (select 1 from services s
                           where s.name = p_service_name
                             and s.id = any(coalesce(ct.services, '{}'::int[])))));
$function$;

comment on function public.sq_coverage_count(integer, numeric, numeric, text) is
  'Contractors who would be invited to a job at this county + point (+ service): the public coverage figure. Service role only.';

-- Read through the coverage route with the service role; never straight from
-- the browser, where it would be a free contractor-density API.
revoke all on function public.sq_coverage_count(integer, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.sq_coverage_count(integer, numeric, numeric, text) to service_role;
