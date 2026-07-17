-- ============================================================================
-- Back-fill claimant links lost in the bidding → FCFS switch.
--
-- Jobs that were 'awarded' under the old bidding system were renamed to
-- 'claimed' by the FCFS migration, but their claimant lived in the (now dropped)
-- bids table, so claimed_by was left null — which made the admin UI show a job
-- as both "claimed" and "not claimed yet". The winner still survives in
-- contact_reveals (route 'bid_won'), so recover it from there.
--
-- Idempotent: only touches claimed jobs that are still missing a claimant.
-- ============================================================================
update jobs j
set claimed_by = cr.contractor_id,
    claimed_at = coalesce(j.claimed_at, cr.revealed_at)
from contact_reveals cr
where cr.job_id = j.id
  and cr.route = 'bid_won'
  and j.status = 'claimed'
  and j.claimed_by is null;
