-- The dashboard's "Get the app" banner, once closed, stays closed on every
-- device. The × still sets the hide_app_banner cookie (instant, and survives
-- Back/Forward); this column is what carries it to the member's other
-- browsers. Written by the member's own session (contractors_update_own;
-- guard_contractor_columns only protects status and vetted_at).
alter table public.contractors
  add column app_banner_dismissed_at timestamptz;
comment on column public.contractors.app_banner_dismissed_at is
  'When the contractor closed the dashboard "Get the app" banner. Set = never show it again, on any device.';
