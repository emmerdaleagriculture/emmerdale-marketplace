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

-- The one rule for turning the ids into names: in the order they were set,
-- and never the primary itself (other write paths — classify, the customer
-- confirm step, repeats — set service_id without touching this list, so the
-- guard lives at read time where it covers all of them).
create or replace function public.sq_also_services(p_also integer[], p_primary integer)
returns text[]
language sql
stable
set search_path to 'public'
as $$
  select array_agg(s.name order by array_position(p_also, s.id))
    from services s
   where s.id = any(coalesce(p_also, '{}'))
     and (p_primary is null or s.id <> p_primary);
$$;

-- Contractor-facing views. Appended last so create or replace is allowed.
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
    sq_also_services(js.also_service_ids, js.service_id) AS also_services
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
    sq_also_services(js.also_service_ids, js.service_id) AS also_services
   FROM job_submissions js
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
     LEFT JOIN client_quotes clq ON clq.id = js.accepted_client_quote_id
     LEFT JOIN contractor_quotes cq ON cq.id = clq.contractor_quote_id
     LEFT JOIN contractor_payouts cp ON cp.submission_id = js.id
  WHERE js.awarded_contractor_id = auth.uid() AND (js.status = ANY (ARRAY['awarded'::text, 'contacted'::text, 'scheduled'::text, 'in_progress'::text, 'completed_by_contractor'::text, 'completed'::text, 'paid'::text, 'variation_pending'::text]));

-- Email/SMS payloads get the list too (the invitation email prints it under Work).
create or replace function public.sq_job_facts(p_submission_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'submission_id', js.id,
    'service', sq_service_label(js.service_id, js.service_verbatim),
    'also_services', sq_also_services(js.also_service_ids, js.service_id),
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
-- to hold the two extra services; put the parser's own list back. Ids are
-- resolved by name, as the other services migrations do.
update job_submissions js
   set also_service_ids = array[
         (select id from services where name = 'Ditch clearance'),
         (select id from services where name = 'Flailing')
       ],
       service_alternatives = array['Land clearance', 'Ditch clearance']
 where js.id = 'd51ba956-b2ce-4fa9-a51e-1fabd8d1d42c'
   and js.service_id = (select id from services where name = 'Hedge cutting');

-- A repeat copies the job as it was, so it copies this too. The live body of
-- run_due_job_schedules (20260912220000) with also_service_ids added to the
-- insert; nothing else changes.
CREATE OR REPLACE FUNCTION public.run_due_job_schedules()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r      record;
  v_new  uuid;
  v_done int := 0;
begin
  for r in
    select s.*, js.id as src
      from job_schedules s
      join job_submissions js on js.id = s.source_submission_id
     where s.active and s.next_run_at <= now()
     for update of s skip locked
  loop
    begin
      insert into job_submissions (
        status, confirmed_at, customer_id, client_token,
        repeat_of, preferred_contractor_id,
        raw_text, location_raw, service_id, service_verbatim, service_confirmed, also_service_ids,
        area_value, area_unit, area_source, area_mapped_value, boundary,
        postcode, lat, lng, county_id,
        urgency, target_date, access_notes, obstacles, service_attributes,
        gate_w3w, gate_width, photo_paths,
        contact_name, contact_phone, contact_email, contact_preference
      )
      select
        'confirmed', now(), r.customer_id, sq_token(),
        r.src, case when r.contractor_mode = 'same' then r.contractor_id end,
        raw_text, location_raw, service_id, service_verbatim, service_confirmed, also_service_ids,
        area_value, area_unit, area_source, area_mapped_value, boundary,
        postcode, lat, lng, county_id,
        urgency, null, access_notes, obstacles, service_attributes,
        gate_w3w, gate_width, photo_paths,
        contact_name, contact_phone, contact_email, contact_preference
        from job_submissions where id = r.src
      returning id into v_new;

      perform log_job_event(v_new, 'status_change', null, 'confirmed', 'system', null,
        'repeat schedule', jsonb_build_object('schedule_id', r.id, 'source', r.src,
                                              'contractor_mode', r.contractor_mode));
      perform distribute_submission(v_new);
      v_done := v_done + 1;
    exception when others then
      raise warning 'job schedule % failed: %', r.id, sqlerrm;
    end;

    update job_schedules
       set last_run_at = now(),
           runs = runs + 1,
           next_run_at = now() + make_interval(months => r.interval_months)
     where id = r.id;
  end loop;
  return v_done;
end;
$function$

;
