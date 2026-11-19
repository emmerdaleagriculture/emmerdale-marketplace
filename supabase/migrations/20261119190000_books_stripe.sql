-- Books, phase 6 (2026-11-19): card payments through each contractor's own
-- Stripe account (Connect Standard: the contractor is the merchant; refunds,
-- disputes and losses are theirs). Invoices are paid by Checkout on the
-- connected account (a direct charge, no platform fee). A daily sync books
-- the account's fees, payouts and refunds into 1220 Stripe balance.

alter table public.books_ledgers
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_connected_at timestamptz,
  add column if not exists stripe_synced_at timestamptz;

create unique index if not exists books_ledgers_stripe_account_uniq
  on public.books_ledgers (stripe_account_id) where stripe_account_id is not null;

-- Who may use Books while it is being trialled. A JSON array of account
-- emails, or the string "all" to open it to every Premium member. Missing =
-- nobody. Read by the app (src/lib/books/access.ts) on every Books page,
-- action, inbound email and Stripe sync.
insert into public.app_config (key, value)
values ('books_allowlist', '["tom@hampshirepaddockmanagement.com"]'::jsonb)
on conflict (key) do nothing;
