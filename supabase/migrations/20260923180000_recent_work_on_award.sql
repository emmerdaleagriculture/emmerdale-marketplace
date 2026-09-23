-- ============================================================================
-- "Work we've completed" moves when a job is awarded, not when it is finished.
--
-- recent_work only listed jobs at 'completed' or 'paid', and inner-joined
-- services — so it needed a job that was both finished AND classified. Since
-- the model came out of job creation almost no job is classified, and the two
-- real awards so far (£1,045 and £275) met neither condition. The board has
-- shown only seeded history since it launched.
--
-- Now: every job from 'awarded' onwards counts — the customer has accepted a
-- price and paid the deposit, which is the figure the board exists to show.
-- 'accepted_awaiting_payment' is not yet a booking and 'disputed' is not a
-- fair advert, so both stay off. Hidden jobs stay off, as everywhere (#101).
--
-- A job with no service_id is labelled from the customer's words by the SAME
-- keyword list jobs_in_progress uses. That list moves into one function here
-- rather than being copied: two copies of a taxonomy drift, and this codebase
-- already has four. An unlabelled job is left off rather than shown as
-- "Land work" — the board's point is what a named job cost.
-- ============================================================================

create or replace function service_label_from_text(p_text text) returns text
language sql immutable set search_path = public as $$
  select p.label
    from (values
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
    -- 'ditch' before 'clearance': "ditch clearance" is a ditch, and the
    -- earliest-mention rule would otherwise let the longer word win.
    ('ditch',           'Ditch clearance'),
    ('clearance',       'Land clearance'),
    ('fencing',         'Fencing'),
    ('fence',           'Fencing'),
    ('post and rail',   'Fencing'),
    ('stock netting',   'Fencing'),
    ('tractor hire',    'Tractor hire (events)'),
    ('renovat',         'Paddock renovation'),
    -- The machinery and forestry services (20260923120000).
    ('mulch',           'Fixed tooth mulching'),
    ('mounding',        'Mounding'),
    ('excavat',         'Excavator work'),
    ('digger',          'Excavator work'),
    ('grading',         'Road grading'),
    ('trailer',         'Trailer work')
    ) as p(pat, label)
   where p_text is not null
     and p_text ilike '%' || p.pat || '%'
   order by position(lower(p.pat) in lower(p_text)), length(p.pat) desc
   limit 1
$$;

-- Pure text → label; both views run it for anonymous readers.
grant execute on function service_label_from_text(text) to anon, authenticated, service_role;

-- ── jobs_in_progress: identical output, one shared list ─────────────────
drop view if exists public.jobs_in_progress;

create view public.jobs_in_progress as
with
e as (
  select
    c.name as county,
    coalesce(s.name, service_label_from_text(js.service_verbatim)) as service,
    case
      when coalesce(js.area_mapped_value, js.area_value) is null then null
      when coalesce(js.area_mapped_value, js.area_value) <= 0 then null
      when js.area_mapped_value is not null
        then rtrim(rtrim(to_char(js.area_mapped_value, 'FM999990.9'), '0'), '.') ||
             case when js.area_mapped_value = 1 then ' acre' else ' acres' end
      when js.area_unit = 'linear_m'
        then round(js.area_value)::text || 'm'
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
  join counties c on c.id = js.county_id
  left join services s on s.id = js.service_id
  where js.status in (
          'distributed', 'quotes_receiving', 'accepted_awaiting_payment',
          'awarded', 'contacted', 'scheduled', 'in_progress'
        )
    and js.hidden_at is null
    and js.created_at > now() - interval '90 days'
)
select
  county,
  service,
  size_label,
  created_on,
  row_number() over (order by created_at desc)::int as ord
from e;

alter view public.jobs_in_progress set (security_invoker = off);
revoke all on public.jobs_in_progress from public;
grant select on public.jobs_in_progress to anon, authenticated;

-- ── recent_work ─────────────────────────────────────────────────────────
create or replace view public.recent_work as
with board as (
  -- Real bookings, from the award onwards. Priced from the ACCEPTED CLIENT
  -- QUOTE, never from job_payments: under the 15% deposit model a job has a
  -- deposit row and a balance row, and neither is what the customer agreed
  -- to pay (20260916120000).
  select
    coalesce(s.name, service_label_from_text(sub.service_verbatim)) as service_name,
    cq.client_price_pence      as amount_pence,
    r.stars                    as stars,          -- null when unrated
    'emmerdale'::text          as source,
    sub.awarded_at             as completed_at,
    0                          as seed_order,
    false                      as is_seed
  from job_submissions sub
  join client_quotes cq on cq.id = sub.accepted_client_quote_id
  left join services s  on s.id  = sub.service_id
  left join contractor_ratings r on r.submission_id = sub.id
  where sub.status in ('awarded', 'contacted', 'scheduled', 'in_progress',
                       'completed_by_contractor', 'completed', 'paid',
                       'variation_pending', 'variation_declined')
    and sub.hidden_at is null
    and coalesce(s.name, service_label_from_text(sub.service_verbatim)) is not null

  union all

  -- Seeded history.
  select
    s.name,
    w.amount_pence,
    null::int,                                    -- never a star on an unrated job
    w.source,
    null::timestamptz,
    w.sort_order,
    true
  from recent_work_seed w
  join services s on s.id = w.service_id
)
select
  service_name,
  amount_pence,
  stars,
  source,
  -- Plain ordinal, so no timestamp is published. Real bookings first, newest
  -- of those first; seeded rows after, in their fixed order.
  row_number() over (
    order by is_seed, completed_at desc nulls last, seed_order
  )::int as ord
from board;
