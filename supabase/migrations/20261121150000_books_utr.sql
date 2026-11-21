-- Books: the business's Unique Taxpayer Reference (2026-11-21).
-- Ten digits: a sole trader's or partner's Self Assessment UTR, or a
-- company's Corporation Tax UTR. Stored digits only. Seen by the owner and
-- any accountant they have shared the books with; never on invoices.

alter table public.books_ledgers
  add column if not exists utr text;

alter table public.books_ledgers
  drop constraint if exists books_ledgers_utr_digits;
alter table public.books_ledgers
  add constraint books_ledgers_utr_digits check (utr is null or utr ~ '^[0-9]{10}$');

comment on column public.books_ledgers.utr is
  'Unique Taxpayer Reference, 10 digits (Self Assessment, or Corporation Tax for a company). Null = not given.';
