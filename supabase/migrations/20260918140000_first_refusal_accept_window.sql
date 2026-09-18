-- ============================================================================
-- First refusal: a price held is not a job won.
--
-- Until now, if the first-refusal contractor priced a job they kept it — the
-- market never opened and the customer saw one price forever (decided
-- 2026-09-14, 20260914120000). That is now a 48-hour option rather than an
-- indefinite hold: if the customer hasn't accepted within
-- sq_first_refusal_accept_hours of receiving the price, the job goes out to
-- every other contractor covering the county, and they get prices to choose
-- between after all.
--
-- The clock runs from quotes_notified_at — the moment the price was SENT to the
-- customer, not the moment the contractor submitted it. If they never open the
-- email the clock still runs: the question is whether they accepted, not
-- whether they looked.
--
-- The customer is told nothing, exactly as before. open_submission_to_market
-- only emails on 'declined'/'timeout' and only when not first_refusal; the
-- reason here is 'unaccepted', which is in neither set, so no mail can fire by
-- accident. More prices simply appear in the portal.
--
-- Repeat direct offers are deliberately untouched. A customer who asked for
-- their previous contractor gets them; that is a different promise from a
-- contractor being handed first look at a stranger's job.
-- ============================================================================

insert into app_config (key, value) values ('sq_first_refusal_accept_hours', '48')
on conflict (key) do nothing;

create or replace function sq_direct_window_tick() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  r     record;
  v_n   int := 0;
begin
  for r in
    -- Branch A, unchanged: the contractor never priced it. Opens when their
    -- window lapses, when they decline, or when there is no preferred
    -- contractor to wait for.
    select js.id,
           case
             when exists (select 1 from job_invitations ji
                           where ji.submission_id = js.id
                             and ji.contractor_id = js.preferred_contractor_id
                             and ji.status = 'declined') then 'declined'
             else 'timeout'
           end as reason
      from job_submissions js
     where js.market_opens_at is not null
       and js.status in ('distributed', 'quotes_receiving')
       and not exists (select 1 from contractor_quotes q
                        where q.submission_id = js.id
                          and q.contractor_id = js.preferred_contractor_id
                          and q.confirmed_by_contractor)
       and (js.market_opens_at <= now()
            or js.preferred_contractor_id is null
            or exists (select 1 from job_invitations ji
                        where ji.submission_id = js.id
                          and ji.contractor_id = js.preferred_contractor_id
                          and ji.status = 'declined'))

    union all

    -- Branch B, new: they DID price it, and the customer has sat on it. Keyed
    -- to quotes_notified_at and NOT to market_opens_at — that one is the
    -- pricing window, is long past on any job that reached this state, and
    -- would fire every such job on the next tick.
    select js.id, 'unaccepted' as reason
      from job_submissions js
     where js.first_refusal
       and js.market_opens_at is not null
       and js.status in ('distributed', 'quotes_receiving')
       and js.quotes_notified_at is not null
       and js.quotes_notified_at
             <= now() - make_interval(hours => app_config_num('sq_first_refusal_accept_hours', 48)::int)
       and exists (select 1 from contractor_quotes q
                    where q.submission_id = js.id
                      and q.contractor_id = js.preferred_contractor_id
                      and q.confirmed_by_contractor)
       -- Belt and braces. The status filter above already excludes an accepted
       -- job (accept moves it to accepted_awaiting_payment), but a job whose
       -- price the customer has taken must never be reopened under any
       -- ordering.
       and not exists (select 1 from client_quotes cq
                        where cq.submission_id = js.id
                          and cq.status = 'accepted')
       and js.accepted_client_quote_id is null
  loop
    perform open_submission_to_market(r.id, r.reason);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- NOTE on quotes_notified_at: the batch notifier (sq_functions) pushes this
-- forward when NEW quotes arrive since the last notification. On a
-- first-refusal job only one contractor is invited, so there is nothing to
-- batch and the value is stable. Were that to change, a revised price would
-- restart the customer's 48 hours — which is arguably correct anyway, since it
-- is a different price to consider.
