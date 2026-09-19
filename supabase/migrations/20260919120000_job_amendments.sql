-- Job amendments: letting a customer correct a job after it has gone out.
--
-- Part 1 took the job description once and never offered a way to change it.
-- A customer who realised their field was 1.25 acres rather than 2 had no
-- option but to email, and the correction was applied by hand — which is how
-- this column came to exist.
--
-- It records when the job was last corrected. That is the one fact the
-- contractor's price page cannot work out for itself: whether the spec moved
-- after they priced it. Comparing amended_at against contractor_quotes.
-- created_at answers it in one column rather than a scan of the event log on
-- every page load.
--
-- Deliberately NOT a supersede. A contractor who has already priced keeps
-- their price: 2 acres or 1.25 makes no difference to a job that was always
-- going to bill at the minimum, and withdrawing the quote would destroy a
-- perfectly good price to no purpose. They are told instead, and revising is
-- their choice — sq_submit_quote already supersedes cleanly when they do.
-- The email is sq_job_amended in supabase/functions/send-emails.

alter table job_submissions
  add column if not exists amended_at timestamptz;

comment on column job_submissions.amended_at is
  'When the customer last corrected the job details after submitting it. Compared against contractor_quotes.created_at so a contractor can be shown that their price predates the change. Null means never amended.';
