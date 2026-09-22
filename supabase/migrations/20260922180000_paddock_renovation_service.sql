-- ════════════════════════════════════════════════════════════════════════
-- "Paddock renovation" joins the taxonomy.
--
-- It is the one description on the board that matches nothing: a customer
-- typed those two words and no more, and renovation is not an operation —
-- it is the umbrella for harrowing, rolling, overseeding and often spraying.
-- Mapping it onto any single one of those would invent the detail.
--
-- THE TRAP THIS MIGRATION HAS TO AVOID. distribute_submission matches
-- `js.service_id = any(ct.services)`. A service nobody has ticked matches no
-- contractor, and the job dies in no_matches — which is WORSE than today,
-- because an unclassified job is currently HELD for an operator
-- (sq_unmatched_needs_classification) rather than sent nowhere. So the row
-- and the contractor back-fill must land together, in one transaction.
--
-- Back-fill rule: anyone already doing BOTH harrowing (5) and rolling (6) —
-- the two operations a renovation always involves. 99 contractors today.
-- They can untick it in /account like any other service.
-- ════════════════════════════════════════════════════════════════════════

-- ── services.listed ─────────────────────────────────────────────────────
-- getServices() feeds the public service strips on /paddock-maintenance,
-- every county page, /agriculturalcontractors and the contractor pickers
-- alike. Adding a row would therefore advertise renovation on ~90 pages as a
-- side effect of classifying it, which is not what was asked for. `listed`
-- separates "a service we recognise and can route" from "a service we put on
-- a marketing page".
--
-- Default true so every existing service is unaffected.
alter table services add column if not exists listed boolean not null default true;

comment on column services.listed is
  'Show on customer-facing service strips. False = recognised and routable, '
  'but not advertised. Contractor pickers ignore this — a contractor must be '
  'able to tick anything they can be sent.';


-- ── The service, and the contractors who cover it ───────────────────────
insert into services (name, area_priced, listed)
values ('Paddock renovation', true, false)
on conflict (name) do nothing;

-- Same transaction as the insert, deliberately: see the trap above.
update contractors
   set services = services || (select id from services where name = 'Paddock renovation')
 where services @> array[5, 6]
   and not (services @> array[(select id from services where name = 'Paddock renovation')]);


-- ── The homepage card can now name it ───────────────────────────────────
-- 'renovat' covers renovation/renovating/renovate. Placed after the specific
-- operations so "harrowing and renovation" still reads as harrowing — the
-- earliest-mention rule does the rest.
drop view if exists public.jobs_in_progress;

create view public.jobs_in_progress as
with
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
    ('tractor hire',    'Tractor hire (events)'),
    ('renovat',         'Paddock renovation')
),
e as (
  select
    c.name as county,
    coalesce(s.name, svc.label) as service,
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
  left join lateral (
    select p.label
      from patterns p
     where js.service_verbatim is not null
       and js.service_verbatim ilike '%' || p.pat || '%'
     order by position(lower(p.pat) in lower(js.service_verbatim)), length(p.pat) desc
     limit 1
  ) svc on true
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
