-- ============================================================================
-- A won job with no matched service was invisible to the contractor who won it.
--
-- my_sq_won_jobs INNER JOINed services. The funnel deliberately allows
-- service_id to be null — spec §4 step 3, "capture always wins over taxonomy":
-- when the customer describes something the taxonomy doesn't hold ("I need
-- some mole ploughing"), we keep their words in service_verbatim and leave the
-- id null rather than force a wrong match. An inner join turns that null into
-- a missing row.
--
-- The result: the contractor was invited (my_sq_invitations already LEFT
-- JOINs), priced it, won it, the customer paid — and /won showed "Nothing
-- yet." They had a paid job and no way to reach the customer. It failed at
-- precisely the point where the money had already changed hands.
--
-- Both views now fall back to the customer's own words, so an unmatched
-- service reads as what they actually asked for instead of a blank.
--
-- security_invoker stays FALSE, as it was. These views run with the owner's
-- rights and the auth.uid() predicate IS the access control; flipping them to
-- invoker rights would put the caller's RLS on job_submissions in the way and
-- empty both pages for everyone.
-- ============================================================================

create or replace view my_sq_won_jobs
with (security_invoker = false) as
  SELECT js.id,
    coalesce(s.name, js.service_verbatim, 'Job') AS service,
    js.contact_name,
    js.contact_phone,
    js.contact_email,
    js.contact_preference,
    js.postcode,
    js.lat,
    js.lng,
    js.gate_w3w,
    js.gate_width,
    js.access_notes,
    js.obstacles,
    js.area_value,
    js.area_unit,
    js.area_mapped_value,
    js.boundary,
    js.urgency,
    js.target_date,
    js.service_attributes,
    js.status,
    js.awarded_at,
    c.name AS county,
    cq.contractor_price_pence
   FROM job_submissions js
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
     LEFT JOIN client_quotes clq ON clq.id = js.accepted_client_quote_id
     LEFT JOIN contractor_quotes cq ON cq.id = clq.contractor_quote_id
  WHERE js.awarded_contractor_id = auth.uid()
    AND (js.status = ANY (ARRAY['awarded'::text, 'contacted'::text, 'scheduled'::text,
                                'in_progress'::text, 'completed_by_contractor'::text,
                                'completed'::text, 'paid'::text]));

-- The invitation already survived a null service_id, but showed the contractor
-- a blank where the job should be. Same fallback, same reason.
create or replace view my_sq_invitations
with (security_invoker = false) as
  SELECT i.id,
    i.token,
    i.status,
    i.decline_reason,
    i.distance_miles,
    i.sent_at,
    i.opened_at,
    js.id AS submission_id,
    coalesce(s.name, js.service_verbatim, 'Job') AS service,
    split_part(js.postcode, ' '::text, 1) AS postcode_district,
    c.name AS county,
    js.area_value,
    js.area_unit,
    js.area_mapped_value,
    js.area_source,
    js.boundary,
    js.urgency,
    js.target_date,
    js.access_notes,
    js.obstacles,
    js.gate_width,
    js.service_attributes,
    js.expires_at,
        CASE
            WHEN js.status = ANY (ARRAY['distributed'::text, 'quotes_receiving'::text, 'accepted_awaiting_payment'::text]) THEN 'open'::text
            ELSE 'closed'::text
        END AS job_state
   FROM job_invitations i
     JOIN job_submissions js ON js.id = i.submission_id
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
  WHERE i.contractor_id = auth.uid();

grant select on my_sq_won_jobs, my_sq_invitations to authenticated;
