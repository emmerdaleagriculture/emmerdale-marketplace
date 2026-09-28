-- ════════════════════════════════════════════════════════════════════════
-- A contractor sees their own payout.
--
-- Payouts are recorded in contractor_payouts (20260928120000), which is
-- sealed from every client role. The contractor's won-jobs view is where
-- their dashboard and /won read a job from, and both kept asking for an
-- invoice after we had paid — the chase email stopped (20260928150000) but
-- the on-screen prompts did not. The amount is their own price, so showing
-- it to them reveals nothing; the view already limits rows to
-- awarded_contractor_id = auth.uid() and runs as its owner, which is what
-- lets it read the sealed table. Two columns appended; the rest is the live
-- definition unchanged.
-- ════════════════════════════════════════════════════════════════════════

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
    cp.paid_on AS paid_out_on
   FROM job_submissions js
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
     LEFT JOIN client_quotes clq ON clq.id = js.accepted_client_quote_id
     LEFT JOIN contractor_quotes cq ON cq.id = clq.contractor_quote_id
     LEFT JOIN contractor_payouts cp ON cp.submission_id = js.id
  WHERE js.awarded_contractor_id = auth.uid() AND (js.status = ANY (ARRAY['awarded'::text, 'contacted'::text, 'scheduled'::text, 'in_progress'::text, 'completed_by_contractor'::text, 'completed'::text, 'paid'::text]));
