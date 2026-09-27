-- Which ad landing page a job was started on.
--
-- /paddock-care (horse owners, small paddocks) joins /start as a second page
-- running the same job flow. Views already record their path
-- (landing_views.path); jobs did not, and handoff can't carry it: handoff
-- means "arrived through our own site", which an ad landing page is not.
-- Null on rows from before this column, which were all /start.

alter table job_submissions
  add column if not exists landing_path text;

comment on column job_submissions.landing_path is
  'The landing page the job flow ran on (/start, /paddock-care). Null before 2026-09-27, when every job came through /start.';
