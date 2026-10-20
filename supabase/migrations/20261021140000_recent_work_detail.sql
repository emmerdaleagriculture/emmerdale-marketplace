-- ============================================================================
-- The booked-work board says where and how big.
--
-- A price on its own answers "am I in the right shop"; a price for two
-- acres in West Sussex answers "is this like my job". The view now carries
-- the county and the job's size — the customer's stated figure and unit,
-- or the acreage measured from their map — for the homepage to round and
-- print beside the price. Seeded rows have neither and print without.
--
-- Still no date, postcode or free text (20260916120000), and the order
-- stays a plain ordinal. The one thing to know: jobs_in_progress (same
-- file as the board's last rewrite) already publishes county, a size to
-- one decimal and the date for live jobs, and a row here with the same
-- county and size could be matched to one there. So the homepage prints
-- the size as a band ("3–10 acres", "100–300 m"), not a figure: the raw
-- columns are here for that rounding, and a band plus a county is a
-- loose enough match that it names no holding. Columns are appended, as
-- create or replace view requires, so nothing reading the old shape
-- changes.
-- ============================================================================

create or replace view public.recent_work as
with board as (
  select
    coalesce(s.name, service_label_from_text(sub.service_verbatim)) as service_name,
    cq.client_price_pence      as amount_pence,
    r.stars                    as stars,
    'emmerdale'::text          as source,
    sub.awarded_at             as completed_at,
    0                          as seed_order,
    false                      as is_seed,
    c.name                     as county,
    sub.area_value             as area_value,
    sub.area_unit              as area_unit,
    sub.area_mapped_value      as area_mapped_value,
    sub.area_source            as area_source,
    -- Acres mean something on topping and not on a hedge: the card prints
    -- an acreage only for work priced by area (a length prints regardless).
    -- A job labelled from the customer's words (service_id null) takes the
    -- flag of the service its label names, so a hedge is a hedge either way.
    coalesce(s.area_priced, s2.area_priced, true) as area_priced
  from job_submissions sub
  join client_quotes cq on cq.id = sub.accepted_client_quote_id
  left join services s  on s.id  = sub.service_id
  left join services s2 on s.id is null
                       and s2.name = service_label_from_text(sub.service_verbatim)
  left join counties c  on c.id  = sub.county_id
  left join contractor_ratings r on r.submission_id = sub.id
  where sub.status in ('awarded', 'contacted', 'scheduled', 'in_progress',
                       'completed_by_contractor', 'completed', 'paid',
                       'variation_pending', 'variation_declined')
    and sub.hidden_at is null
    and coalesce(s.name, service_label_from_text(sub.service_verbatim)) is not null

  union all

  select
    s.name,
    w.amount_pence,
    null::int,
    w.source,
    null::timestamptz,
    w.sort_order,
    true,
    null::text,
    null::numeric,
    null::text,
    null::numeric,
    null::text,
    true
  from recent_work_seed w
  join services s on s.id = w.service_id
)
select
  service_name,
  amount_pence,
  stars,
  source,
  row_number() over (
    order by is_seed, completed_at desc nulls last, seed_order
  )::int as ord,
  county,
  area_value,
  area_unit,
  area_mapped_value,
  area_source,
  area_priced
from board;
