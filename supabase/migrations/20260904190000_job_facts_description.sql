-- ============================================================================
-- Put the customer's own words in the job facts.
--
-- sq_job_facts feeds the invitation email, and it carried the *classified
-- service name* as the only description of the work. Now that routing ignores
-- the service (20260904180000) that name is usually null, so an invitation
-- read "Work: —" and told the contractor nothing about the job — exactly the
-- thing they are now expected to judge for themselves.
--
-- service_verbatim is what the quote page already shows them; raw_text is the
-- untouched step-1 text behind it. Prefer the former, fall back to the latter.
-- Only a key is added; every existing consumer is unaffected.
-- ============================================================================

create or replace function sq_job_facts(p_submission_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'submission_id', js.id,
    'service', s.name,
    'description', coalesce(nullif(btrim(js.service_verbatim), ''), js.raw_text),
    'county', c.name,
    'postcode_district', split_part(js.postcode, ' ', 1),
    'area_value', js.area_value,
    'area_unit', js.area_unit,
    'area_mapped_value', js.area_mapped_value,
    'urgency', js.urgency,
    'target_date', js.target_date,
    'access_notes', js.access_notes,
    'obstacles', js.obstacles,
    'gate_width', js.gate_width,
    'expires_at', js.expires_at
  )
  from job_submissions js
  left join services s on s.id = js.service_id
  left join counties c on c.id = js.county_id
  where js.id = p_submission_id;
$$;
