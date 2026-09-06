-- ============================================================================
-- Resend sends more ways for a message to not arrive than the first pass
-- allowed for.
--
-- email.failed    — the provider could not send it at all.
-- email.suppressed — the address is on Resend's suppression list, usually
--                    from an earlier hard bounce, so it was never attempted.
--
-- Both mean the recipient got nothing, and both were falling through the
-- webhook's ignore branch: acknowledged, recorded nowhere, and left showing
-- as a clean "sent" — the exact failure this table set out to end.
-- ============================================================================

alter table pending_emails drop constraint if exists pending_emails_delivery_status_check;
alter table pending_emails add constraint pending_emails_delivery_status_check
  check (delivery_status is null or delivery_status in
         ('delivered','bounced','complained','delayed','failed','suppressed'));

drop index if exists pending_emails_delivery_problem_idx;
create index pending_emails_delivery_problem_idx
  on pending_emails (delivery_at desc)
  where delivery_status in ('bounced','complained','failed','suppressed');
