-- ════════════════════════════════════════════════════════════════════════
-- Say what the job IS, not just how big it is.
--
-- "2.1 acres · West Sussex · 21 Sept" tells a visitor nothing about the work.
-- The obvious source is service_verbatim, and it is exactly the thing that
-- must never reach a public page. Real live rows right now include:
--
--   "Paddock topping its steep ground with Reed's on it"
--   "Orchard in Littledean needs tipping Spring, summer to control thistle"
--
-- A name and a village. Beside a county, an acreage and a date, that narrows
-- a job to one holding — which is the reasoning 20260916120000 already set
-- out for the recent-work board.
--
-- So the view never emits the customer's text. It matches that text against a
-- fixed keyword list and emits one of the canonical services table names, or
-- nothing. The output is drawn from a closed set: a new phrasing can only
-- produce a known label or a blank, never prose. Matching happens in SQL
-- rather than in the component for the same reason the column list does —
-- a leak would require editing this file.
--
-- Which one wins: the service whose keyword appears EARLIEST in the text,
-- because that is what the customer led with. "Spraying, rotivating, seeding,
-- rolling 2.5 acres" reads as spraying; "Topping weed spraying" as topping.
-- Ties go to the longer keyword, which is the more specific one ("flail
-- collect" over "flail").
--
-- service_id still wins outright where it is set. It is null on every live
-- job today (job creation runs deterministic-only since 8e86e71), but if that
-- ever changes the classified value should beat a keyword guess.
-- ════════════════════════════════════════════════════════════════════════

-- Dropped rather than replaced: CREATE OR REPLACE VIEW can only append
-- columns, and `service` belongs beside `county`, not tacked on the end.
drop view if exists public.jobs_in_progress;

create view public.jobs_in_progress as
with
-- Keyword → canonical services.name. Every label here must exist in that
-- table; the view publishes the label, never the pattern and never the
-- customer's words.
patterns(pat, label) as (
  values
    ('flail collect',   'Flail collecting'),
    ('flail',           'Flailing'),
    ('hedge',           'Hedge cutting'),
    ('topping',         'Paddock topping'),
    ('topped',          'Paddock topping'),
    ('top the',         'Paddock topping'),
    ('mole plough',     'Mole ploughing'),
    ('stone bury',      'Stone burying'),
    ('rotavat',         'Rotavating'),
    ('rotivat',         'Rotavating'),
    ('harrow',          'Harrowing'),
    ('rolling',         'Rolling'),
    ('rolled',          'Rolling'),
    ('overseed',        'Overseeding'),
    ('reseed',          'Overseeding'),
    ('seeding',         'Overseeding'),
    ('fertilis',        'Fertiliser application'),
    ('fertiliz',        'Fertiliser application'),
    ('spray',           'Spraying'),
    ('weed',            'Weed control'),
    ('thistle',         'Weed control'),
    ('ragwort',         'Weed control'),
    ('nettle',          'Weed control'),
    ('bracken',         'Weed control'),
    ('mowing',          'Finish mowing'),
    ('mown',            'Finish mowing'),
    ('muck',            'Manure sweeping'),
    ('manure',          'Manure sweeping'),
    ('dung',            'Manure sweeping'),
    ('haylage',         'Hay, straw & haylage'),
    ('straw',           'Hay, straw & haylage'),
    ('bale',            'Hay, straw & haylage'),
    ('hay',             'Hay, straw & haylage'),
    ('ditch',           'Land & ditch clearance'),
    ('clearance',       'Land & ditch clearance'),
    ('tractor hire',    'Tractor hire (events)')
),
e as (
  select
    c.name as county,
    -- Canonical only. coalesce so a classified service_id always wins.
    coalesce(s.name, svc.label) as service,
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
  left join services s on s.id = js.service_id
  left join lateral (
    select p.label
      from patterns p
     where js.service_verbatim is not null
       and js.service_verbatim ilike '%' || p.pat || '%'
     -- Earliest mention first, then the more specific keyword.
     order by position(lower(p.pat) in lower(js.service_verbatim)), length(p.pat) desc
     limit 1
  ) svc on true
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
  service,
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
