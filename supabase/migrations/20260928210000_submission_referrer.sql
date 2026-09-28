-- ============================================================================
-- The external page that sent a job's customer, kept on the job.
--
-- job_submissions held only the source DERIVED from the referrer — and before
-- #143, not even that past the homepage hand-off. Re-attributing the first 48
-- jobs (2026-09-28) meant matching each one to its parse event's IP and that
-- IP's landing views: 24 were Facebook, against the 5 the Sources page showed.
-- Stored here, the raw referrer makes that a column read rather than a join
-- through an IP address.
--
-- Same 300-character clamp the browser applies (firstTouch.ts); this is the
-- backstop for anything that reaches the table another way.
-- ============================================================================

alter table job_submissions add column if not exists referrer text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'job_submissions_referrer_len_check') then
    alter table job_submissions add constraint job_submissions_referrer_len_check
      check (referrer is null or length(referrer) <= 300);
  end if;
end $$;
