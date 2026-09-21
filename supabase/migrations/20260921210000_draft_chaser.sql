-- Chasing a job somebody started and did not send.
--
-- The confirm screen loses most of the people who reach it, and every one of
-- them is a described job in a real postcode. Until contact details were kept
-- on blur there was nothing to chase with; now there is, and this is the
-- column that stops us chasing twice.
--
-- Deliberately a timestamp rather than a boolean: knowing WHEN we wrote to
-- someone is the difference between a record and a flag, and it is the thing
-- anyone investigating a complaint will want.

alter table job_submissions
  add column if not exists draft_chased_at timestamptz;

comment on column job_submissions.draft_chased_at is
  'When the abandoned-draft reminder was sent. Null = never chased. One per draft.';

-- The worker asks one question every few minutes: which drafts have contact
-- details, are old enough to count as abandoned, and have not been written to.
-- Partial so it stays small — a confirmed job is never a candidate again, and
-- the table is overwhelmingly confirmed jobs.
create index if not exists job_submissions_chaseable_idx
  on job_submissions (created_at)
  where status = 'draft' and draft_chased_at is null and contact_email is not null;
