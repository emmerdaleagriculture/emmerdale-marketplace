-- ============================================================================
-- Bidding RPC + integrity guards.
-- ============================================================================

-- ── place_bid() (spec §4) ───────────────────────────────────────────────────
-- The only way a contractor writes a bid. Security-definer so it can validate
-- against the sealed jobs table. Enforces: authenticated + approved contractor,
-- job open + consented, and the job's county is one the contractor covers.
-- Revising re-uses the row (UPSERT on the unique) — no duplicate bids
-- (acceptance #9). created_at is preserved on revision so an early low bid keeps
-- its tie-break priority.
create or replace function place_bid(p_job_id uuid, p_amount_pence int, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid := auth.uid();
  v_job        record;
  v_bid_id     uuid;
begin
  if v_contractor is null then raise exception 'not authenticated'; end if;
  if p_amount_pence is null or p_amount_pence <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if not exists (select 1 from contractors
                 where id = v_contractor and status = 'approved') then
    raise exception 'contractor not approved';
  end if;

  select * into v_job from jobs where id = p_job_id;
  if v_job.id is null then raise exception 'job not found'; end if;
  if v_job.status <> 'open' then raise exception 'job is not open for bidding'; end if;
  if not v_job.consent_to_share then raise exception 'job not available'; end if;

  if not exists (select 1 from contractor_counties cc
                 where cc.contractor_id = v_contractor and cc.county_id = v_job.county_id) then
    raise exception 'job is not in one of your counties';
  end if;

  insert into bids (job_id, contractor_id, amount_pence, note)
    values (p_job_id, v_contractor, p_amount_pence, p_note)
    on conflict (job_id, contractor_id)
      do update set amount_pence = excluded.amount_pence, note = excluded.note
    returning id into v_bid_id;

  return v_bid_id;
end;
$$;

-- ── Contractor column guard ─────────────────────────────────────────────────
-- A contractor may edit their own profile, but NOT self-approve. Only the
-- service role (admin routes) may change `status`.
create or replace function guard_contractor_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'contractor status can only be changed by an admin';
  end if;
  return new;
end;
$$;

drop trigger if exists contractors_guard on contractors;
create trigger contractors_guard
  before update on contractors
  for each row execute function guard_contractor_columns();

-- ── subscriptions.updated_at touch ──────────────────────────────────────────
create or replace function touch_subscription_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscriptions_touch on subscriptions;
create trigger subscriptions_touch
  before update on subscriptions
  for each row execute function touch_subscription_updated_at();
