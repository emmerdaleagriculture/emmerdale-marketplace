-- Books › Year end: keep the exact request a filing was sent with, sealed
-- (it carries the Government Gateway / Companies House credentials), so a
-- retry after a timeout replays it byte for byte under the same
-- Idempotency-Key. Rebuilding it instead (jsonb reorders keys; credentials
-- may have changed since) gives a different body, which TinyTax answers
-- with 409 IDEMPOTENCY_KEY_CONFLICT, and that once unlocked filing again.
alter table public.books_filings add column if not exists sealed_body text;

comment on column public.books_filings.sealed_body is
  'The exact JSON sent to TinyTax, sealed with BOOKS_SECRETS_KEY (ledger id as AAD). Replayed on retry; never shown.';
