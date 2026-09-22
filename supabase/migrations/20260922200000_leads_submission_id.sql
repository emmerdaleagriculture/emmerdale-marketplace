-- ════════════════════════════════════════════════════════════════════════
-- Leads can now point at a sealed-quote submission, not only a legacy job.
--
-- Portal enquiries (hay, tractor hire) publish into job_submissions so they
-- appear on /admin/ops with everything else — two systems for the same thing
-- was why they never showed up there. leads.job_id has a foreign key to
-- jobs(id), so a submission id silently violated it and the lead stayed
-- `pending` while its work was already out with contractors.
--
-- A second nullable column rather than a polymorphic job_id: the constraint
-- is what caught the mistake, and dropping it to make one column mean two
-- things would throw that away. Historic leads keep job_id; new ones get
-- submission_id; the admin queue reads whichever is set.
-- ════════════════════════════════════════════════════════════════════════

alter table leads add column if not exists submission_id uuid references job_submissions(id);

comment on column leads.submission_id is
  'The sealed-quote submission this lead became. Mutually exclusive with '
  'job_id, which points at the legacy jobs board and is kept for history.';

create index if not exists leads_submission_idx on leads (submission_id)
  where submission_id is not null;
