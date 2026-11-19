-- Books, phase 4 (2026-11-19): VAT. Which months a business's VAT quarters
-- end in (HMRC staggers them): 0 = Mar/Jun/Sep/Dec, 1 = Jan/Apr/Jul/Oct,
-- 2 = Feb/May/Aug/Nov. The return itself is computed from books_entries; the
-- one-off pre-registration reclaim is an ordinary entry (source 'prereg',
-- external_id 'prereg', so it can only be posted once).

alter table public.books_ledgers
  add column if not exists vat_quarter_stagger smallint not null default 0
    check (vat_quarter_stagger between 0 and 2);
