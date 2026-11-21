-- Books: contractors brand their own invoices (2026-11-21).
--
-- A logo and an accent colour, used on the invoice PDF, the customer's
-- /i/<token> page and the invoice email. The logo is re-encoded by the app
-- (sharp → PNG, fitted inside 800×300, metadata stripped) and stored in a
-- public bucket: it is shown to whoever the invoice goes to, and an <img> in
-- an email needs a plain URL. Uploads go through a server action with the
-- service role, so the bucket needs no policies.

alter table public.books_ledgers
  add column if not exists invoice_logo_path text,
  add column if not exists invoice_colour text;

alter table public.books_ledgers
  drop constraint if exists books_ledgers_invoice_colour_hex;
alter table public.books_ledgers
  add constraint books_ledgers_invoice_colour_hex
  check (invoice_colour is null or invoice_colour ~ '^#[0-9a-f]{6}$');

comment on column public.books_ledgers.invoice_logo_path is
  'Invoice logo: object path in the books-logos bucket (public, PNG). Null = name only.';
comment on column public.books_ledgers.invoice_colour is
  'Invoice accent colour, lower-case #rrggbb. Null = Emmerdale green (#1f4d2b).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books-logos', 'books-logos', true, 2097152, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
