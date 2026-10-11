-- ============================================================================
-- Stump grinding and Mobile log splitting join the services table.
--
-- Tom (2026-10-11). Both are priced by the job (a count of stumps, a pile of
-- timber), not by the acre, so area_priced is false and the form never asks
-- for a field boundary. Both are listed, so they appear on the DB-driven
-- strips as well as the home cards (app code, same PR).
--
-- Contractor tick-boxes: every new service is ticked for every contractor
-- (the convention since 20260923120000). Earlier migrations did that by
-- resetting everyone to the full list, which was fine when the full list was
-- what everyone had. Today 129 of 336 contractors have trimmed theirs, so
-- this one APPENDS the two new ids and leaves the rest of each list alone.
-- The one services_only contractor (a hay supplier) is skipped: his ticks
-- are a filter, and ticking stump grinding would send him stump jobs.
--
-- The keyword labeller learns stumps, log splitting and firewood so an
-- unclassified job about them reads right on the public boards.
-- ============================================================================

insert into services (name, area_priced, listed) values
  ('Stump grinding',       false, true),
  ('Mobile log splitting', false, true)
on conflict (name) do nothing;

update contractors k
   set services = (
     select array_agg(distinct id order by id)
       from unnest(coalesce(k.services, '{}'::int[]) || (
         select array_agg(id) from services
          where name in ('Stump grinding', 'Mobile log splitting')
       )) as t(id)
   )
 where not coalesce(k.services_only, false)
   and not (coalesce(k.services, '{}'::int[]) @> (
     select array_agg(id) from services
      where name in ('Stump grinding', 'Mobile log splitting')
   ));

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
    ('trailer',         'Trailer work'),
    -- 20260924120000.
    -- Not bare 'lime': "limestone" (a track, a shelter floor) is not lime
    -- spreading, and two real jobs said exactly that.
    ('liming',          'Lime spreading'),
    ('lime spread',     'Lime spreading'),
    ('spread lime',     'Lime spreading'),
    ('spreading lime',  'Lime spreading'),
    ('ag lime',         'Lime spreading'),
    ('agricultural lime','Lime spreading'),
    ('lime the',        'Lime spreading'),
    ('lime on',         'Lime spreading'),
    ('felling',         'Tree felling & chipping'),
    ('fell the',        'Tree felling & chipping'),
    ('chipping',        'Tree felling & chipping'),
    ('chipper',         'Tree felling & chipping'),
    ('subsoil',         'Sub-soiling'),
    ('sub-soil',        'Sub-soiling'),
    ('sub soil',        'Sub-soiling'),
    ('scarif',          'Scarifying'),
    -- 20261011180000. "Fell the ash and grind the stump" is felling: the
    -- earliest mention wins, and felling is said first.
    ('stump',           'Stump grinding'),
    ('log split',       'Mobile log splitting'),
    ('logs split',      'Mobile log splitting'),
    ('split logs',      'Mobile log splitting'),
    ('splitting logs',  'Mobile log splitting'),
    ('split the logs',  'Mobile log splitting'),
    ('split some logs', 'Mobile log splitting'),
    ('split into logs', 'Mobile log splitting'),
    ('firewood',        'Mobile log splitting')
    ) as p(pat, label)
   where p_text is not null
     and p_text ilike '%' || p.pat || '%'
   order by position(lower(p.pat) in lower(p_text)), length(p.pat) desc
   limit 1
$$;
