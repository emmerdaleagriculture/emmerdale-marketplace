-- ============================================================================
-- Deleting a contractor failed for anyone who had ever been invited to a
-- sealed quote.
--
-- The admin Delete button removes the auth user and lets the cascade take the
-- contractor row, their counties, notifications and subscription. But
-- job_invitations pointed at contractors with no delete rule, and
-- invitation_events / inbound_email_events pointed at job_invitations the
-- same way, so the cascade hit the first invitation and stopped. Two
-- contractors whose addresses had bounced had to be removed by hand.
--
-- An invitation is a fact about a contractor, and its events are facts about
-- the invitation: nothing else references either, so they go with the
-- contractor. The inbound-email log is an audit trail of what the parser did
-- with mail we received, and keeps its rows with the link cleared.
--
-- Quotes, ratings and awarded jobs are deliberately left restricting. A
-- contractor with a quote on file has customer prices and payments hanging
-- off it; that contractor is suspended, not deleted, and the action now says
-- so instead of failing.
-- ============================================================================

alter table job_invitations
  drop constraint job_invitations_contractor_id_fkey,
  add constraint job_invitations_contractor_id_fkey
    foreign key (contractor_id) references contractors(id) on delete cascade;

alter table invitation_events
  drop constraint invitation_events_invitation_fk,
  add constraint invitation_events_invitation_fk
    foreign key (invitation_id) references job_invitations(id) on delete cascade;

alter table inbound_email_events
  drop constraint inbound_email_events_invitation_id_fkey,
  add constraint inbound_email_events_invitation_id_fkey
    foreign key (invitation_id) references job_invitations(id) on delete set null;
