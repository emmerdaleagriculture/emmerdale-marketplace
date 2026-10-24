-- A job can be more than one kind of work. "Hedging/ditching and field mowing"
-- is one job with one primary service (the label, the pricing mode, the email
-- subject) and two further services the customer also wants. Until now the only
-- place to record the extra two was service_alternatives, which is the parser's
-- list of OTHER GUESSES shown to the customer at the confirm step — not work
-- they asked for — so showing it to contractors would mislabel most jobs.
-- also_service_ids is the honest home: set by an operator, shown to contractors
-- on the price page and their lists, never used for routing (county-only).

alter table job_submissions
  add column if not exists also_service_ids integer[] not null default '{}';

comment on column job_submissions.also_service_ids is
  'Further services the customer also wants on this job, beside service_id. Operator-set; display only.';

-- Contractor-facing views: the names, in the order the operator set them.
-- Appended last so create or replace is allowed.
create or replace view my_sq_invitations as
 SELECT i.id,
    i.token,
    i.status,
    i.decline_reason,
    i.distance_miles,
    i.sent_at,
    i.opened_at,
    js.id AS submission_id,
    COALESCE(s.name, js.service_verbatim, 'Job'::text) AS service,
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
        END AS job_state,
        CASE
            WHEN js.preferred_contractor_id = i.contractor_id THEN js.market_opens_at
            WHEN i.premium_offer AND js.premium_window THEN js.market_opens_at
            ELSE NULL::timestamp with time zone
        END AS offered_until,
    i.premium_offer,
    (select array_agg(s2.name order by array_position(js.also_service_ids, s2.id))
       from services s2 where s2.id = any(js.also_service_ids)) AS also_services
   FROM job_invitations i
     JOIN job_submissions js ON js.id = i.submission_id
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
  WHERE i.contractor_id = auth.uid();

create or replace view my_sq_won_jobs as
 SELECT js.id,
    COALESCE(s.name, js.service_verbatim, 'Job'::text) AS service,
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
    cq.contractor_price_pence,
    js.contractor_invoice_name,
    js.contractor_invoice_at,
    cp.amount_pence AS paid_out_pence,
    cp.paid_on AS paid_out_on,
    (select array_agg(s2.name order by array_position(js.also_service_ids, s2.id))
       from services s2 where s2.id = any(js.also_service_ids)) AS also_services
   FROM job_submissions js
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
     LEFT JOIN client_quotes clq ON clq.id = js.accepted_client_quote_id
     LEFT JOIN contractor_quotes cq ON cq.id = clq.contractor_quote_id
     LEFT JOIN contractor_payouts cp ON cp.submission_id = js.id
  WHERE js.awarded_contractor_id = auth.uid() AND (js.status = ANY (ARRAY['awarded'::text, 'contacted'::text, 'scheduled'::text, 'in_progress'::text, 'completed_by_contractor'::text, 'completed'::text, 'paid'::text, 'variation_pending'::text]));

-- Email/SMS payloads get the list too, for templates that want it.
create or replace function public.sq_job_facts(p_submission_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'submission_id', js.id,
    'service', sq_service_label(js.service_id, js.service_verbatim),
    'also_services', (select array_agg(s2.name order by array_position(js.also_service_ids, s2.id))
                        from services s2 where s2.id = any(js.also_service_ids)),
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

-- The job this was built for (Stockport, 24 Oct 2026): Hedge cutting with
-- Ditch clearance and Flailing also wanted. Its alternatives had been borrowed
-- to hold the two extra services; put the parser's own list back.
update job_submissions
   set also_service_ids = array[22, 2],
       service_alternatives = array['Land clearance', 'Ditch clearance']
 where id = 'd51ba956-b2ce-4fa9-a51e-1fabd8d1d42c'
   and service_id = 18;
