-- ============================================================================
-- The customer's answers, readable, in the facts every job email is built from.
--
-- service_attributes holds machine values (weeds: 'ragwort,docks'); the words
-- they stand for live in the app (src/lib/jobParse/conditions.ts), which is
-- what the contractor's job page renders them with. An email built from the
-- raw values would say "old_fence: yes" — or, worse, a second copy of the
-- labels would drift from the first. So the confirm step writes the rendered
-- lines once, here ("Weeds: Ragwort, Docks"), and sq_job_facts carries them.
--
-- First need: a spraying job is priced on what is growing, and the invitation
-- email is where a contractor decides whether to open it at all.
-- ============================================================================

alter table job_submissions add column if not exists details_text text;

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
    'expires_at', js.expires_at,
    -- The customer's answers to the service's own questions, one per line.
    'details', nullif(btrim(js.details_text), '')
  )
  from job_submissions js
  left join counties c on c.id = js.county_id
  left join services s on s.id = js.service_id
  where js.id = p_submission_id;
$function$;
