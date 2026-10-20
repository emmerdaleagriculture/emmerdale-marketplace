-- When a contractor was last emailed the contact-attempt warning
-- (sq_contact_warning, offPlatformAlert.ts warnContractor). The once-per-30-
-- days guard is a conditional update of this column: whoever's update returns
-- the row sends the email, so two refusals in flight at once cannot both
-- queue one, and a changed email address does not reset the clock.
alter table public.contractors
  add column if not exists contact_warned_at timestamptz;
