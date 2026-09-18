-- ============================================================================
-- Two things a contractor cannot currently see about their own price: whether
-- the customer has looked at it, and where it sits among the others.
--
-- VIEWED. The timestamp lives on client_quotes, not on the submission, because
-- what is being recorded is that THIS PRICE was shown — not that a customer
-- visited. First view only; it never updates again, so it cannot become a log
-- of somebody's browsing.
--
-- POSITION. The sealed-quote design keeps prices from other contractors, and
-- that does not change here: this function returns a RANK and a normalised
-- position, never a price, never a competitor's identity. It is deliberately
-- withheld until enough others have priced — with one or two rivals, "you are
-- highest" is close to telling someone the other number outright.
--
-- Compared on contractor_price_pence, not the client price: the markup is
-- uniform, so the ordering is identical, but a contractor should see where
-- their own number sits rather than one with our margin on it.
--
-- Superseded quotes are excluded. A contractor who revises twice must not
-- appear three times in their own comparison.
-- ============================================================================

alter table client_quotes add column if not exists viewed_at timestamptz;

comment on column client_quotes.viewed_at is
  'First time this price was rendered to the customer. Never updated after the first view — it records that the price was seen, not the customer''s activity.';

insert into app_config (key, value) values ('sq_price_position_min_others', '3')
on conflict (key) do nothing;

-- ── Mark a price as seen ────────────────────────────────────────────────────
-- Called when the customer's portal renders their quotes. Idempotent by
-- construction: only rows still null are touched, so the value is the FIRST
-- view and repeat visits change nothing.
create or replace function sq_mark_quotes_viewed(p_submission_id uuid)
returns int
language sql volatile security definer set search_path = public as $$
  with touched as (
    update client_quotes
       set viewed_at = now()
     where submission_id = p_submission_id
       and viewed_at is null
       and status in ('active', 'accepted')
    returning 1
  )
  select count(*)::int from touched;
$$;

revoke execute on function sq_mark_quotes_viewed(uuid) from public, anon, authenticated;
grant execute on function sq_mark_quotes_viewed(uuid) to service_role;

-- ── Where a contractor's price sits ─────────────────────────────────────────
-- One row whenever this contractor has a live price, so "has the customer seen
-- it?" is always answerable — that has nothing to do with how many rivals
-- there are. The RANK and POSITION are the sensitive part, and those come back
-- null until enough others have priced that the bar cannot point at one of
-- them.
create or replace function sq_quote_position(p_submission_id uuid, p_contractor_id uuid)
-- `position` is reserved in Postgres and will not parse as a column name here,
-- so the normalised 0..1 value is price_position.
returns table (
  price_rank      int,     -- 1 = cheapest
  price_total     int,     -- how many live prices, including this one
  price_position  numeric, -- 0 = cheapest, 1 = dearest; null when all equal
  viewed_at       timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_min_others int := app_config_num('sq_price_position_min_others', 3)::int;
begin
  return query
  with live as (
    -- One row per contractor: the current price, superseded revisions dropped.
    select q.contractor_id, q.contractor_price_pence as pence
      from contractor_quotes q
     where q.submission_id = p_submission_id
       and q.confirmed_by_contractor
       and q.superseded_by is null
  ),
  stats as (
    select count(*)::int as n, min(pence) as lo, max(pence) as hi from live
  ),
  mine as (
    select pence from live where contractor_id = p_contractor_id
  )
  select
    -- Withheld below the threshold. n counts everyone, so "3 others" means 4.
    case when s.n >= v_min_others + 1
         then (select count(*)::int + 1 from live l where l.pence < m.pence) end as price_rank,
    case when s.n >= v_min_others + 1 then s.n end as price_total,
    case when s.n >= v_min_others + 1 and s.hi <> s.lo
         then round((m.pence - s.lo)::numeric / (s.hi - s.lo), 4) end as price_position,
    -- Always returned: whether the customer has seen this price is the
    -- contractor's own business, and reveals nothing about anyone else.
    (select cq.viewed_at from client_quotes cq
      where cq.submission_id = p_submission_id
        and cq.contractor_id = p_contractor_id
      order by cq.created_at desc limit 1) as viewed_at
  from mine m, stats s;
end;
$$;

revoke execute on function sq_quote_position(uuid, uuid) from public, anon;
grant execute on function sq_quote_position(uuid, uuid) to service_role;
