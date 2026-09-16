-- ============================================================================
-- Recent enquiries: what's coming in, kept deliberately vague.
--
-- A different claim from the recent-work board. That one says "this is what
-- people paid"; this one says "this is what's being asked for". Drafts are
-- included on purpose — someone who typed a description and left still made an
-- enquiry — which is exactly why the wording must be ENQUIRIES and never
-- "jobs booked". Most rows here never reached a booking.
--
-- Exposes county, a coarse size and a bucketed recency. NOT the service (there
-- isn't one: job creation runs deterministic-only since 8e86e71, so service_id
-- is null on almost every row by design, not by accident), and NOT postcode,
-- raw_text, service_verbatim, access_notes, contact details, lat/lng or any
-- attribution. The customer's own words routinely carry a yard name, a road or
-- a phone number.
--
-- The creation date is shown as a date, at Tom's instruction (16 Sept 2026).
-- Time of day is dropped: it adds nothing to the card and a timestamp beside a
-- county and an acreage narrows a job to a specific holding further than it
-- looks. The brief asked for bucketed relative dates for that reason; this is
-- a deliberate override of it, not an oversight.
-- ============================================================================

create or replace view public.recent_enquiries as
with e as (
  select
    c.name as county,
    -- Only ever from the structured area columns, never free text. The
    -- deterministic parse fills these by regex, so they are present on roughly
    -- two thirds of rows; the rest render as county alone.
    case
      when js.area_value is null then null
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
  -- Stale enquiries read as a dead marketplace. Ninety days, same as the
  -- recent-work board.
  where js.created_at > now() - interval '90 days'
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
alter view public.recent_enquiries set (security_invoker = off);
revoke all on public.recent_enquiries from public;
grant select on public.recent_enquiries to anon, authenticated;
