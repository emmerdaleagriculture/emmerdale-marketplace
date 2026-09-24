-- ============================================================================
-- Four more services, ticked for every contractor; the keyword list learns them.
--
-- Tom (2026-09-24): Lime spreading, Tree felling & chipping, Sub-soiling and
-- Scarifying join the services table. Flail collecting and Stone burying were
-- already rows — they only lacked a home page card, which is app code.
--
-- area_priced: lime, subsoiling and scarifying are priced by the acre; felling
-- and chipping is priced by the job.
--
-- Every contractor is ticked for every service (20260923120000), so the new
-- rows are ticked for all of them in the same transaction — a service nobody
-- has ticked must never exist.
-- ============================================================================

insert into services (name, area_priced, listed) values
  ('Lime spreading',          true,  true),
  ('Tree felling & chipping', false, true),
  ('Sub-soiling',             true,  true),
  ('Scarifying',              true,  true)
on conflict (name) do nothing;

update contractors
   set services = (select array_agg(id order by id) from services)
 where not (services @> (select array_agg(id) from services));

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
    ('lime',            'Lime spreading'),
    ('felling',         'Tree felling & chipping'),
    ('fell the',        'Tree felling & chipping'),
    ('chipping',        'Tree felling & chipping'),
    ('chipper',         'Tree felling & chipping'),
    ('subsoil',         'Sub-soiling'),
    ('sub-soil',        'Sub-soiling'),
    ('sub soil',        'Sub-soiling'),
    ('scarif',          'Scarifying')
    ) as p(pat, label)
   where p_text is not null
     and p_text ilike '%' || p.pat || '%'
   order by position(lower(p.pat) in lower(p_text)), length(p.pat) desc
   limit 1
$$;
