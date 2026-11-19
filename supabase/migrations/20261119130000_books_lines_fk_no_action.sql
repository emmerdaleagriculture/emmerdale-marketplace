-- Books (2026-11-19): books_lines → books_accounts was ON DELETE RESTRICT,
-- which Postgres checks immediately, before a cascade has reached the lines.
-- So deleting a ledger (or the contractor, or their auth user — account
-- deletion cascades all the way down) failed on the first account still
-- referenced by a line. Plain NO ACTION isn't enough either: its check can
-- run before the cascade through books_entries reaches the lines (tested).
-- Deferred to commit, the cascade has finished by the time it is checked,
-- and deleting a single account that has lines is still refused.

alter table public.books_lines drop constraint if exists books_lines_ledger_id_account_id_fkey;
alter table public.books_lines
  add constraint books_lines_ledger_id_account_id_fkey
  foreign key (ledger_id, account_id) references public.books_accounts (ledger_id, id) on delete no action deferrable initially deferred;
