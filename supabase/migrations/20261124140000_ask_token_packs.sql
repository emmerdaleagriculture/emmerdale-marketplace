-- Ask token packs (2026-11-24): a bought pack remembers the Stripe payment it
-- came from, so a refund of that payment can take back whatever is unspent.
-- The Checkout session id (already unique on the lot) is what stops one
-- payment granting twice.

alter table public.ask_token_lots add column if not exists stripe_payment_intent_id text;
create index if not exists ask_token_lots_intent_idx
  on public.ask_token_lots (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
