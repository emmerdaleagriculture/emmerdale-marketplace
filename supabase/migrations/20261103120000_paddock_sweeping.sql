-- ============================================================================
-- Paddock sweeping joins the services table.
--
-- Tom (2026-11-03). A separate service from Manure sweeping: same towed
-- sweeper or vacuum, but the job is what falls from the trees (acorns,
-- sycamore seeds, leaves), mostly in autumn and mostly along the tree line.
-- Droppings alone stay Manure sweeping.
--
-- Priced by the acre (area_priced), like Manure sweeping, and listed.
-- Ticked for every contractor by APPENDING the id (the 20261011180000
-- pattern); services_only contractors are skipped, their ticks are a filter.
--
-- The keyword labeller learns sweeping phrases ahead of the bare 'muck'.
-- Re-states the 20261021190000 body with those lines added.
-- ============================================================================

insert into services (name, area_priced, listed) values
  ('Paddock sweeping', true, true)
on conflict (name) do nothing;

update contractors k
   set services = (
     select array_agg(distinct id order by id)
       from unnest(coalesce(k.services, '{}'::int[]) ||
            (select array_agg(id) from services where name = 'Paddock sweeping')) as t(id)
   )
 where not coalesce(k.services_only, false)
   and not (coalesce(k.services, '{}'::int[]) @>
            (select array_agg(id) from services where name = 'Paddock sweeping'));

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
    -- 20261021190000. Spreading before the bare stems: "muck spreading" and
    -- "spread muckheap" are both at the earliest position with 'muck', and the
    -- longer pattern wins the tie. A heap taken away or cleared is removal;
    -- a heap with no verb is closer to spreading than to sweeping. Not bare
    -- 'slurry': it is liquid, goes on by tanker, and "slurry pit" is yard work.
    ('muck heap remov', 'Muck heap removal'),
    ('muck heap clear', 'Muck heap removal'),
    ('muck heap taken', 'Muck heap removal'),
    ('muckheap remov',  'Muck heap removal'),
    ('manure heap remov','Muck heap removal'),
    ('muck removal',    'Muck heap removal'),
    ('manure removal',  'Muck heap removal'),
    ('remove the muck', 'Muck heap removal'),
    ('remove muck',     'Muck heap removal'),
    ('clear the muck heap','Muck heap removal'),
    ('clear muck heap', 'Muck heap removal'),
    ('muck away',       'Muck heap removal'),
    ('muck spread',     'Muck spreading'),
    ('spread muck',     'Muck spreading'),
    ('spreading muck',  'Muck spreading'),
    ('spread the muck', 'Muck spreading'),
    ('manure spread',   'Muck spreading'),
    ('spread manure',   'Muck spreading'),
    ('spreading manure','Muck spreading'),
    ('spread the manure','Muck spreading'),
    ('dung spread',     'Muck spreading'),
    ('spread my muck',  'Muck spreading'),
    ('spread our muck', 'Muck spreading'),
    ('spread horse muck','Muck spreading'),
    ('spread the horse muck','Muck spreading'),
    ('muck needs spread','Muck spreading'),
    ('muck to be spread','Muck spreading'),
    ('manure to be spread','Muck spreading'),
    ('farmyard manure', 'Muck spreading'),
    ('muck heap',       'Muck spreading'),
    ('muckheap',        'Muck spreading'),
    ('manure heap',     'Muck spreading'),
    -- 20261103120000. Leaf, acorn and sycamore-seed clearing ahead of the
    -- bare 'muck': "sweep the acorns, and the muck too" is a paddock sweep.
    -- Not bare 'sycamore' ("fell two sycamores" is felling) and not bare
    -- 'leaves' ("the topper leaves clumps").
    ('paddock sweep',   'Paddock sweeping'),
    ('acorn',           'Paddock sweeping'),
    ('sycamore seed',   'Paddock sweeping'),
    ('sycamore helicopter','Paddock sweeping'),
    ('leaf sweep',      'Paddock sweeping'),
    ('leaf clear',      'Paddock sweeping'),
    ('leaf collect',    'Paddock sweeping'),
    ('leaf fall',       'Paddock sweeping'),
    ('fallen leaves',   'Paddock sweeping'),
    ('sweep leaves',    'Paddock sweeping'),
    ('sweep up leaves', 'Paddock sweeping'),
    ('sweep the leaves','Paddock sweeping'),
    ('sweeping leaves', 'Paddock sweeping'),
    ('clear leaves',    'Paddock sweeping'),
    ('clear the leaves','Paddock sweeping'),
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
