-- ════════════════════════════════════════════════════════════════════════
-- Problem reports know which job they are about.
--
-- Nearly everything a customer or contractor does happens on /my/<token>
-- and /quote/<token>, where nobody is signed in and the path is stored
-- redacted. A report from there arrived as "Not signed in, /my/[token]":
-- no name, no email, no job. On 2026-10-07 a contractor told the customer
-- "the photos don't seem to be loading" in the thread instead of telling
-- us, and the first we knew was the customer forwarding it.
--
-- The action now resolves the token on the server (never trusting a field
-- from the form) and keeps the job, the thread and the person's name here,
-- so the admin page can link straight to the submission and the email can
-- say who it was. The token itself is still never stored.
-- ════════════════════════════════════════════════════════════════════════

alter table feedback
  add column if not exists submission_id uuid references job_submissions (id) on delete set null,
  add column if not exists invitation_id uuid references job_invitations (id) on delete set null,
  add column if not exists contact_name text;

create index if not exists feedback_submission_idx on feedback (submission_id) where submission_id is not null;
