-- ════════════════════════════════════════════════════════════════════════
-- Stop telling contractors the area is "not stated" for work that has no area.
--
-- The one hay job to go through the sealed flow drew 14 invitations, 5 opens
-- and no prices at all. Its invitation read:
--
--     In their words: "16 small bales of hay and 4 small bales of straw
--                      needed this week and then monthly ongoing"
--     Work:      Hay, straw & haylage
--     Area:      not stated
--
-- Twenty bales of hay have no acreage. "Not stated" reads as a customer who
-- withheld something, on the line a contractor scans before deciding whether
-- to bother — and it sits directly under a description that states the
-- quantity perfectly clearly.
--
-- services.area_priced already records which work is measured by the acre;
-- the invitation simply never had it. Carrying it lets the renderer drop the
-- line rather than fill it with an apology. Hay, straw & haylage and Tractor
-- hire (events) are the two false ones today.
--
-- Not a claim that this is why nobody priced it — one job is not evidence.
-- It is a line that is wrong on its face, and it costs nothing to remove.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.sq_job_facts(p_submission_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'submission_id', js.id,
    'service', sq_service_label(js.service_id, js.service_verbatim),
    'description', coalesce(nullif(btrim(js.service_verbatim), ''), js.raw_text),
    'county', c.name,
    'postcode_district', split_part(js.postcode, ' ', 1),
    'area_value', js.area_value,
    'area_unit', js.area_unit,
    'area_mapped_value', js.area_mapped_value,
    -- Null for an unclassified job, where "not stated" is the honest answer
    -- because we genuinely do not know. Only an explicit false suppresses it.
    'area_priced', s.area_priced,
    'urgency', js.urgency,
    'target_date', js.target_date,
    'access_notes', js.access_notes,
    'obstacles', js.obstacles,
    'gate_width', js.gate_width,
    'expires_at', js.expires_at
  )
  from job_submissions js
  left join counties c on c.id = js.county_id
  left join services s on s.id = js.service_id
  where js.id = p_submission_id;
$function$;

revoke execute on function sq_job_facts(uuid) from public, anon, authenticated;
grant execute on function sq_job_facts(uuid) to service_role;
