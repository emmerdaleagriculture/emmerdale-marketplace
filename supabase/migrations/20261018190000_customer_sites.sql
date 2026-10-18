-- ============================================================================
-- A customer's land (PRD task 6): the fields and paddocks they book work on.
-- The app asks for the first one straight after the phone step ("Where's
-- your land?"), by current location or postcode, and the Account screen
-- lists them. Acres is whatever they said; the job flow still measures.
-- ============================================================================

create table if not exists public.customer_sites (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  label        text not null default 'Home paddock',
  postcode     text not null,
  county_id    int references public.counties(id),
  lat          double precision,
  lng          double precision,
  acres        numeric(8,2),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists customer_sites_customer_idx on public.customer_sites (customer_id, created_at);

alter table public.customer_sites enable row level security;
-- Their own, and only their own; the app writes through the service role.
create policy customer_sites_select_own on public.customer_sites for select using (customer_id = auth.uid());
create policy customer_sites_insert_own on public.customer_sites for insert with check (customer_id = auth.uid());
create policy customer_sites_update_own on public.customer_sites for update using (customer_id = auth.uid());
create policy customer_sites_delete_own on public.customer_sites for delete using (customer_id = auth.uid());
