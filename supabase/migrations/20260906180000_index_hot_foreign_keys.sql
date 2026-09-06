-- ============================================================================
-- Indexes on the foreign keys the app actually filters and joins by.
--
-- Postgres does not index the referencing side of a foreign key, and thirteen
-- of ours had none. Most are harmless at this size. These are the ones on the
-- request path:
--
--   job_submissions.awarded_contractor_id — every load of /won is
--     "where awarded_contractor_id = auth.uid()".
--   job_submissions.county_id / service_id — distribution and the admin lists.
--   client_quotes.contractor_id, contractor_quotes.invitation_id,
--     contractor_ratings.contractor_id, job_payments.client_quote_id — the
--     joins behind the portal, the quote page and the money page.
--
-- Tables are tiny today, so this changes nothing measurable yet. It is here
-- so the day they are not tiny is not the day someone discovers it.
-- ============================================================================

create index if not exists job_submissions_awarded_contractor_idx
  on job_submissions (awarded_contractor_id) where awarded_contractor_id is not null;
create index if not exists job_submissions_county_idx   on job_submissions (county_id);
create index if not exists job_submissions_service_idx  on job_submissions (service_id);
create index if not exists client_quotes_contractor_idx on client_quotes (contractor_id);
create index if not exists contractor_quotes_invitation_idx on contractor_quotes (invitation_id);
create index if not exists contractor_ratings_contractor_idx on contractor_ratings (contractor_id);
create index if not exists job_payments_client_quote_idx on job_payments (client_quote_id);
