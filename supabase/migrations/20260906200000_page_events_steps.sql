-- ============================================================================
-- Milestones on /start.
--
-- The beacon knew where people clicked and how far they scrolled — the shape
-- of a visit, not its outcome. For a two-step form paid for by ad clicks the
-- question is where in the two steps people stop: did they type, did they
-- press Send, did the parse come back, did they draw the field, did they
-- start the contact details, did they finish. Each of those is now a 'step'
-- event with the milestone in `label` and how long into the visit it came.
-- ============================================================================

alter table page_events add column if not exists seconds int;

alter table page_events drop constraint if exists page_events_kind_check;
alter table page_events add constraint page_events_kind_check
  check (kind in ('click', 'depth', 'step'));

alter table page_events drop constraint if exists page_events_seconds_check;
alter table page_events add constraint page_events_seconds_check
  check (seconds is null or (seconds >= 0 and seconds <= 86400));

-- The journey report asks "which sessions reached which milestone" for one
-- path; nothing else reads this table by label.
create index if not exists page_events_step_idx
  on page_events (path, label, session_key) where kind = 'step';
