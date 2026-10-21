-- ============================================================================
-- Muck spreading joins the services table.
--
-- Tom (2026-10-21). Until now the only muck service was Manure sweeping
-- (collecting droppings off a paddock), so a job to spread a muck heap had
-- nowhere to go: the parser left it unmatched and the board labeller called
-- it Manure sweeping off the word "muck". Three such jobs since 15 Sep.
--
-- Priced by the acre it goes on (area_priced), like lime, and listed.
-- Ticked for every contractor by APPENDING the id (the 20261011180000
-- pattern); services_only contractors are skipped, their ticks are a filter.
--
-- The keyword labeller learns spreading phrases ahead of the bare 'muck'.
-- ============================================================================

insert into services (name, area_priced, listed) values
  ('Muck spreading', true, true)
on conflict (name) do nothing;

update contractors k
   set services = (
     select array_agg(distinct id order by id)
       from unnest(coalesce(k.services, '{}'::int[]) ||
            (select array_agg(id) from services where name = 'Muck spreading')) as t(id)
   )
 where not coalesce(k.services_only, false)
   and not (coalesce(k.services, '{}'::int[]) @>
            (select array_agg(id) from services where name = 'Muck spreading'));

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
    -- longer pattern wins the tie. A muck heap is spreading work, not sweeping.
    ('muck spread',     'Muck spreading'),
    ('spread muck',     'Muck spreading'),
    ('spreading muck',  'Muck spreading'),
    ('spread the muck', 'Muck spreading'),
    ('manure spread',   'Muck spreading'),
    ('spread manure',   'Muck spreading'),
    ('spreading manure','Muck spreading'),
    ('spread the manure','Muck spreading'),
    ('dung spread',     'Muck spreading'),
    ('slurry',          'Muck spreading'),
    ('farmyard manure', 'Muck spreading'),
    ('muck heap',       'Muck spreading'),
    ('muckheap',        'Muck spreading'),
    ('manure heap',     'Muck spreading'),
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
