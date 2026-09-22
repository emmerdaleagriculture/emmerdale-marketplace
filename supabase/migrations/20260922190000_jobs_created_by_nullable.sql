-- ════════════════════════════════════════════════════════════════════════
-- jobs.created_by becomes nullable: null means the system made it.
--
-- Portal enquiries (hay, tractor hire) now publish themselves to the
-- contractors covering the county, with no operator in the loop. Every other
-- insert still records the person who posted — admin/jobs/new and the
-- contractor-facing jobs/new both pass user.id and are untouched.
--
-- The alternative was stamping an admin's id on a job they never saw, which
-- would put a real name against an automatic decision in the one column that
-- exists to answer "who did this".
--
-- No foreign key on the column, and its only reader
-- (admin/jobs/[id] looks up whether a contractor posted it) already handles
-- finding no match, since an admin-posted job never matches either.
-- ════════════════════════════════════════════════════════════════════════

alter table jobs alter column created_by drop not null;

comment on column jobs.created_by is
  'Who posted it. Null = created automatically from a portal enquiry '
  '(see autoConvertEnquiry); otherwise the admin or contractor user id.';
