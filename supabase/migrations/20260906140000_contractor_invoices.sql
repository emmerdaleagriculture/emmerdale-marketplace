-- ============================================================================
-- Contractors need to send us an invoice for the work they have finished.
--
-- The money is already held, the customer has confirmed, and the payout is
-- owed — but there was nowhere to put the piece of paper that lets us pay it.
-- It arrived by email, or it didn't arrive, and either way nothing on the job
-- said whether it had.
--
-- One invoice per job, replaceable: a contractor who sends the wrong figure
-- should be able to send the right one over the top rather than us holding
-- two and guessing.
-- ============================================================================

alter table job_submissions
  add column if not exists contractor_invoice_path text,
  add column if not exists contractor_invoice_name text,
  add column if not exists contractor_invoice_at   timestamptz;

comment on column job_submissions.contractor_invoice_path is
  'Object path in the private contractor-invoices bucket. Null = not sent yet.';

-- Private, like job-photos: everything goes through the service role and a
-- signed URL, so there is no storage policy to get wrong.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contractor-invoices', 'contractor-invoices', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- What ops actually asks: which finished jobs are still waiting on paperwork.
create index if not exists job_submissions_awaiting_invoice_idx
  on job_submissions (awarded_at)
  where contractor_invoice_path is null
    and status in ('completed', 'paid');

-- The won-jobs view is the contractor's own page; it has to show whether we
-- already have their invoice, or they will send it twice.
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
    cq.contractor_price_pence,
    js.contractor_invoice_name,
    js.contractor_invoice_at
   FROM job_submissions js
     LEFT JOIN services s ON s.id = js.service_id
     LEFT JOIN counties c ON c.id = js.county_id
     LEFT JOIN client_quotes clq ON clq.id = js.accepted_client_quote_id
     LEFT JOIN contractor_quotes cq ON cq.id = clq.contractor_quote_id
  WHERE js.awarded_contractor_id = auth.uid()
    AND (js.status = ANY (ARRAY['awarded'::text, 'contacted'::text, 'scheduled'::text,
                                'in_progress'::text, 'completed_by_contractor'::text,
                                'completed'::text, 'paid'::text]));

grant select on my_sq_won_jobs to authenticated;
