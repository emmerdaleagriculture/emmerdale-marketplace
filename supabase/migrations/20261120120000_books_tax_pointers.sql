-- Books: tax pointers (Tally 2.12 / 3.10). The person says how they're taxed
-- (self-employed, partner, LLP member or limited company, plus other income,
-- profit share, Scottish rates, associated companies), which can differ from
-- the business type the chart was set up for. Pointers they've dealt with are
-- ticked off per year: {"<pointer>|<year start>": true}.

alter table public.books_ledgers
  add column if not exists tax_profile jsonb not null default '{}'::jsonb,
  add column if not exists tax_done jsonb not null default '{}'::jsonb;
