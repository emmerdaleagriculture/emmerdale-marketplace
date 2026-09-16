-- ============================================================================
-- The recent-work board: what people actually paid.
--
-- Replaces published guide prices. A price list promises a figure for the next
-- job and cannot survive the variance in this trade — access, ground, season
-- and scale move the number more than the name of the service does. Completed
-- work makes no promise about the next job, so nobody can be ambushed by it,
-- while still answering the only question a visitor has: am I in the right
-- shop.
--
-- Exposes service, amount, rating and source. NOT customer, contractor,
-- postcode, county, size, date or any free text — the customer's own words
-- (raw_text, service_verbatim, access_notes) routinely contain a yard name, a
-- road or a phone number, and an exact date alongside a place and an acreage
-- narrows a job to a specific holding far more than it looks.
-- ============================================================================

-- ── recent_work_seed ────────────────────────────────────────────────────────
-- Real completed jobs that predate the payment system. Emmerdale has trading
-- history that job_payments has no row for, and the board would otherwise be
-- empty at launch.
--
-- Deliberately NOT backfilled into job_payments: inventing payment rows to
-- solve a design problem would corrupt every revenue figure the admin
-- reporting draws from that table. A separate table keeps the money records
-- honest and makes these rows easy to drop once real bookings outnumber them.
create table if not exists recent_work_seed (
  id           bigint generated always as identity primary key,
  service_id   int not null references services(id),
  amount_pence int not null check (amount_pence > 0),
  -- Whose trading history this is. The board is a claim about Emmerdale, so
  -- Hampshire Paddock Management work must carry its own label rather than be
  -- presented as an Emmerdale booking — the two businesses are at arm's
  -- length.
  source       text not null default 'emmerdale'
                 check (source in ('emmerdale', 'hpm')),
  -- Stable order in place of a date. Nothing on the card is dated, so there is
  -- no recency to sort by and none is implied.
  sort_order   int not null default 0,
  -- Internal reference only — which job this was, in Tom's words. NEVER
  -- selected by the view below: the board shows county-or-coarser and this is
  -- a person's name.
  note         text,
  created_at   timestamptz not null default now()
);

-- Service role only. The view is the public surface; this table is not.
alter table recent_work_seed enable row level security;

-- Identity for the re-run guard below. Migrations here are expected to be
-- idempotent, and without this a second `db push` would insert the same nine
-- jobs again and show every one of them twice.
create unique index if not exists recent_work_seed_note_key
  on recent_work_seed (note);

-- ── The nine ────────────────────────────────────────────────────────────────
-- Real Emmerdale marketplace jobs, confirmed by Tom 16 Sept 2026. No ratings:
-- none of these were rated, and a default or averaged star on an unrated job
-- is a fake review — enforceable directly by the CMA under the DMCC Act.
--
-- Joined by service NAME, never a hardcoded serial id (same reason seed.sql
-- resolves counties by name).
insert into recent_work_seed (service_id, amount_pence, sort_order, note)
select s.id, v.amount_pence, v.sort_order, v.note
from (values
  ('Paddock topping',        28000,  1, 'Nav — topping'),
  ('Flail collecting',      120000,  2, 'Long Cross Equestrian — flail collection'),
  ('Spraying',               43500,  3, 'Sam — spraying'),
  ('Harrowing',              69000,  4, 'Cheryl — harrowing'),
  ('Rotavating',             60000,  5, 'Steve — rotavating'),
  ('Paddock topping',        57500,  6, 'Lauren — topping'),
  ('Land & ditch clearance', 300000, 7, 'Millie — ground clearance'),
  -- Drainage has no service of its own; ditch work is the closest fit in the
  -- taxonomy. Reclassify to 'Mole ploughing' if that reads truer.
  ('Land & ditch clearance', 2200000, 8, 'Adrees — drainage'),
  ('Flailing',               34600,  9, 'John — flailing')
) as v(service_name, amount_pence, sort_order, note)
join services s on s.name = v.service_name
on conflict (note) do nothing;

-- ── recent_work ─────────────────────────────────────────────────────────────
create or replace view public.recent_work as
with board as (
  -- Real completed bookings.
  --
  -- Priced from the ACCEPTED CLIENT QUOTE, never from job_payments. Since the
  -- 15% deposit model went live (20260910120000) a completed job writes TWO
  -- paid rows — kind 'deposit' and kind 'balance' — so joining that table
  -- would list every job twice, once at 15% of its price and once at 85%.
  -- Neither figure is what the customer paid. client_price_pence is the
  -- customer-facing total, stored rather than computed, and it already
  -- includes the markup: the contractor's net lives on contractor_quotes and
  -- is never serialised to the client.
  select
    s.name                     as service_name,
    cq.client_price_pence      as amount_pence,
    r.stars                    as stars,          -- null when unrated
    'emmerdale'::text          as source,
    sub.awarded_at             as completed_at,
    0                          as seed_order,
    false                      as is_seed
  from job_submissions sub
  join client_quotes cq on cq.id = sub.accepted_client_quote_id
  join services     s  on s.id  = sub.service_id
  left join contractor_ratings r on r.submission_id = sub.id
  where sub.status in ('completed', 'paid')

  union all

  -- Seeded history.
  select
    s.name,
    w.amount_pence,
    null::int,                                    -- never a star on an unrated job
    w.source,
    null::timestamptz,
    w.sort_order,
    true
  from recent_work_seed w
  join services s on s.id = w.service_id
)
select
  service_name,
  amount_pence,
  stars,
  source,
  -- Plain ordinal, so no timestamp is published. Real bookings first, newest
  -- of those first; seeded rows after, in their fixed order.
  row_number() over (
    order by is_seed, completed_at desc nulls last, seed_order
  )::int as ord
from board;

-- The view reads tables that are RLS-protected and must not be readable
-- directly, so it runs as its owner and is granted explicitly.
alter view public.recent_work set (security_invoker = off);
revoke all on public.recent_work from public;
grant select on public.recent_work to anon, authenticated;
