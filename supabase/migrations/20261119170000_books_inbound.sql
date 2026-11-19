-- Books, phase 3 (2026-11-19): receipts by email. Each set of books gets an
-- unguessable code; mail to receipts+<code>@emmerdaleagriculture.com reaches
-- /api/books/inbound-email (Google Workspace routes the plus-addresses on to
-- the Resend inbound domain). Only senders on the ledger's list (plus the
-- contractor's own account email, checked in the app) are read by AI; mail
-- from anyone else waits in review unread, so a stranger can't spend reads.

alter table public.books_ledgers
  add column if not exists inbound_code text,
  add column if not exists inbound_senders text[] not null default '{}';

update public.books_ledgers
   set inbound_code = substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12)
 where inbound_code is null;

alter table public.books_ledgers
  alter column inbound_code set default substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12),
  alter column inbound_code set not null;

create unique index if not exists books_ledgers_inbound_code_uniq on public.books_ledgers (inbound_code);
alter table public.books_ledgers drop constraint if exists books_ledgers_inbound_code_format;
alter table public.books_ledgers add constraint books_ledgers_inbound_code_format check (inbound_code ~ '^[0-9a-f]{12}$');

-- The same email (Message-ID) arriving twice is ignored.
create index if not exists books_receipts_ledger_message_idx
  on public.books_receipts (ledger_id, message_id) where message_id is not null;
