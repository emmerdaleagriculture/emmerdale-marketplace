-- ════════════════════════════════════════════════════════════════════════
-- recent_enquiries becomes jobs_in_progress.
--
-- The strip made the weaker claim it could honestly make at the time: "these
-- are enquiries, most never became a booking, drafts are counted". There is
-- now real live work to point at, so the homepage shows that instead, above
-- the completed-work board.
--
-- What changes is the WHERE clause, not the shape. Still county, an
-- approximate size and the date — never a postcode, never free text, never a
-- contact. The reasoning in 20260916120000 holds and is worth repeating: the
-- customer's own words routinely carry a yard name or a road, and an exact
-- date beside a place and an acreage narrows a job to a specific holding far
-- more than it looks.
--
-- Deliberately NOT adding the service name. service_id is null on every live
-- job — job creation has run deterministic-only since 8e86e71 — so a service
-- column would be empty or, worse, invite someone to fill it from
-- service_verbatim, which is the customer's free text.
--
-- Drafts are gone from it. A draft is somebody who started typing and
-- stopped; calling that a job in progress would be the same overstatement the
-- old copy was careful to avoid.
-- ════════════════════════════════════════════════════════════════════════

drop view if exists public.recent_enquiries;

create or replace view public.jobs_in_progress as
with e as (
  select
    c.name as county,
    -- Only ever from the structured area columns, never free text. Prefers
    -- the drawn boundary, which is measured rather than estimated.
    case
      when coalesce(js.area_mapped_value, js.area_value) is null then null
      -- A drawn boundary of zero, or an area the parse read as 0, is an
      -- absent measurement rather than a small one. "0 acres" on the
      -- homepage reads as a broken card; county alone reads as a job.
      when coalesce(js.area_mapped_value, js.area_value) <= 0 then null
      when js.area_mapped_value is not null
        then rtrim(rtrim(to_char(js.area_mapped_value, 'FM999990.9'), '0'), '.') ||
             case when js.area_mapped_value = 1 then ' acre' else ' acres' end
      when js.area_unit = 'linear_m'
        then round(js.area_value)::text || 'm'
      -- FM drops the trailing zero but KEEPS the decimal point, so a whole
      -- number formats as "24." — the double rtrim takes the zero then the
      -- orphaned point, leaving "24" while "2.5" survives intact.
      when js.area_unit = 'acres'
        then rtrim(rtrim(to_char(js.area_value, 'FM999990.9'), '0'), '.') ||
             case when js.area_value = 1 then ' acre' else ' acres' end
      when js.area_unit = 'hectares'
        then rtrim(rtrim(to_char(js.area_value * 2.471, 'FM999990.9'), '0'), '.') || ' acres'
      when js.area_unit = 'sq_m'
        then rtrim(rtrim(to_char(js.area_value / 4046.86, 'FM999990.9'), '0'), '.') || ' acres'
      else null
    end as size_label,
    js.created_at::date as created_on,
    js.created_at
  from job_submissions js
  -- Inner join: a submission whose postcode never resolved to a county has
  -- nothing publishable at all, so it drops out rather than rendering blank.
  join counties c on c.id = js.county_id
  -- Live work only: sent to contractors and not yet finished, dead or
  -- withdrawn. Anything expired, cancelled, completed or unquoted is not "in
  -- progress" and saying so would be untrue on the one page that has to be
  -- trusted.
  where js.status in (
          'distributed', 'quotes_receiving', 'accepted_awaiting_payment',
          'awarded', 'contacted', 'scheduled', 'in_progress'
        )
    and js.hidden_at is null
    -- Stale work reads as a dead marketplace. Ninety days, same as the
    -- recent-work board.
    and js.created_at > now() - interval '90 days'
)
select
  county,
  size_label,
  created_on,
  -- Newest first. The ordinal saves the component re-sorting, and no
  -- timestamp is published — created_on is a date, not a point in time.
  row_number() over (order by created_at desc)::int as ord
from e;

-- Reads an RLS-protected table that must not be readable directly, so the view
-- runs as its owner and is granted explicitly.
alter view public.jobs_in_progress set (security_invoker = off);
revoke all on public.jobs_in_progress from public;
grant select on public.jobs_in_progress to anon, authenticated;
