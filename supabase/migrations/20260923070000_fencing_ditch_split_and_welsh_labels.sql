-- ════════════════════════════════════════════════════════════════════════
-- Three things a contractor told us, on his first morning on the platform.
--
-- Philip Howells (SA44, west Wales) signed up, was approved, and immediately
-- sent feedback: "No Pembrokeshire and Ceradigion also would u include
-- fencing as it's a big part of our business".
--
-- He was right twice, and the second one was worse than he knew.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. Wales is stored as the counties nobody has used since 1996 ───────
--
-- The eight Welsh rows are the PRESERVED counties (Clwyd, Dyfed, Gwent,
-- Gwynedd, the three Glamorgans, Powys) — the 1974–1996 set. Pembrokeshire
-- and Ceredigion are both inside Dyfed, which Philip had already ticked, so
-- he was receiving those jobs all along: district_county_map routes
-- Pembrokeshire → Dyfed and Ceredigion → Dyfed. He simply had no way to know.
--
-- THE NAME CANNOT CHANGE. counties.name is matched verbatim (lowercased)
-- against the ONS admin_county field in postcodes.ts, and countySlug(name)
-- builds the public /hay/<county> URLs that are already indexed. Renaming
-- "Dyfed" would silently break postcode resolution and move live pages.
--
-- So the modern areas go in a display-only column instead. Nothing routes on
-- it, nothing is slugged from it; it exists so the picker can say what a
-- preserved county actually contains.
alter table counties add column if not exists covers text;

comment on column counties.covers is
  'Display only: the modern principal areas this (preserved/historic) county '
  'contains, for pickers and coverage maps. NEVER used for matching or URLs — '
  'counties.name is matched against ONS admin_county and is the slug source.';

update counties set covers = 'Conwy, Denbighshire, Flintshire & Wrexham'                 where name = 'Clwyd';
update counties set covers = 'Carmarthenshire, Ceredigion & Pembrokeshire'               where name = 'Dyfed';
update counties set covers = 'Blaenau Gwent, Caerphilly, Monmouthshire, Newport & Torfaen' where name = 'Gwent';
update counties set covers = 'Gwynedd & Isle of Anglesey'                                where name = 'Gwynedd';
update counties set covers = 'Bridgend, Merthyr Tydfil & Rhondda Cynon Taf'              where name = 'Mid Glamorgan';
update counties set covers = 'Cardiff & the Vale of Glamorgan'                           where name = 'South Glamorgan';
update counties set covers = 'Neath Port Talbot & Swansea'                               where name = 'West Glamorgan';
-- Powys is both the preserved county and the modern principal area. Nothing
-- to explain, so it stays null rather than repeating itself back at the reader.


-- ── 2. We were advertising fencing and could not route a single job ─────
--
-- src/lib/home/services.ts has carried a fencing card since the redesign —
-- "Post-and-rail, stock and equestrian fencing, supplied and fitted" — with
-- its own icon, on the front page. There has never been a services row, so
-- no contractor could tick it and no job could be classified as it. A
-- customer clicking that card described work nobody could be matched to.
--
-- area_priced = false: fencing is quoted by the metre, which the unit-price
-- machinery already does (formatUnitPrice → "£14 per metre × 300 metres").
-- Area pricing would force one lump total, which is how the hay job ended up
-- at zero.
--
-- listed = false, for now, and this is the honest part: adding the row makes
-- fencing ROUTABLE, not COVERED. One contractor does it. Advertising it on
-- ~90 county service strips would repeat the mistake at greater volume. Flip
-- this to true when coverage exists — the contractor pickers ignore `listed`
-- entirely, so contractors can tick it from /account today.
insert into services (name, area_priced, listed)
values ('Fencing', false, false)
on conflict (name) do nothing;

-- The contractor who asked for it, in the same transaction as the row.
-- (See the trap under §3 — a service nobody has ticked is worse than none.)
update contractors
   set services = services || (select id from services where name = 'Fencing')
 where email = 'phowells_17@hotmail.co.uk'
   and not (services @> array[(select id from services where name = 'Fencing')]);


-- ── 3. "Land & ditch clearance" was two trades wearing one coat ─────────
--
-- Clearing overgrown ground is priced by the acre. Clearing a ditch is priced
-- by the metre. One row cannot be both, and today the row is area_priced, so
-- a contractor pricing 120 metres of ditch can only offer a single lump sum.
--
-- THE TRAP, inherited verbatim from 20260922180000 (Paddock renovation):
-- distribute_submission matches `js.service_id = any(ct.services)`. A service
-- nobody has ticked matches no contractor, so the job dies in no_matches —
-- which is WORSE than an unclassified job, because that one is HELD for an
-- operator instead of being sent nowhere. The new row and the back-fill must
-- land together, in this transaction.
--
-- Row 10 is RENAMED rather than retired. job_submissions.service_id points at
-- it, 118 approved contractors have ticked it, and "Land clearance" is what
-- most of that history actually was. Retiring it would orphan the lot.
update services set name = 'Land clearance' where name = 'Land & ditch clearance';

insert into services (name, area_priced, listed)
values ('Ditch clearance', false, true)
on conflict (name) do nothing;

-- Everyone who cleared land and ditches under one name still does both.
-- They can untick either in /account, like any other service.
update contractors
   set services = services || (select id from services where name = 'Ditch clearance')
 where services @> array[(select id from services where name = 'Land clearance')]
   and not (services @> array[(select id from services where name = 'Ditch clearance')]);


-- ── 4. The homepage strip has to know all three names ───────────────────
--
-- jobs_in_progress labels a job from the customer's own words when no service
-- was matched. Its pattern list still says 'Land & ditch clearance', a name
-- that no longer exists, so those jobs would show a service the site cannot
-- otherwise name. 'ditch' must now beat 'clearance', and fencing joins.
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
    -- 'ditch' before 'clearance': "ditch clearance" is a ditch, and the
    -- earliest-mention rule would otherwise let the longer word win.
    ('ditch',           'Ditch clearance'),
    ('clearance',       'Land clearance'),
    ('fencing',         'Fencing'),
    ('fence',           'Fencing'),
    ('post and rail',   'Fencing'),
    ('stock netting',   'Fencing'),
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
