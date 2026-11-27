-- Info › Spray diary (/info/spray-diary): the record of a pesticide
-- application that a professional user must keep (product, when, how much,
-- where and on what), one row per product applied. Any signed-in account may
-- keep one; rows are the owner's alone.
create table if not exists public.spray_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sprayed_on date not null,
  start_time time,
  end_time time,
  -- Where: the field or site as the operator knows it.
  site text not null check (char_length(btrim(site)) between 1 and 200),
  postcode text check (postcode is null or char_length(postcode) <= 10),
  customer text check (customer is null or char_length(customer) <= 200),
  -- The crop or situation treated ("grazing paddock", "hay field").
  situation text not null check (char_length(btrim(situation)) between 1 and 200),
  area_ha numeric(9, 3) not null check (area_ha > 0 and area_ha < 100000),
  -- What and how much.
  product text not null check (char_length(btrim(product)) between 1 and 200),
  mapp text check (mapp is null or mapp ~ '^[0-9]{4,6}$'),
  dose numeric(10, 3) not null check (dose > 0),
  dose_unit text not null default 'L/ha' check (dose_unit in ('L/ha', 'ml/ha', 'kg/ha', 'g/ha')),
  water_l_ha numeric(7, 1) check (water_l_ha is null or water_l_ha > 0),
  target text check (target is null or char_length(target) <= 300),
  -- Conditions at the time.
  wind_mph numeric(4, 1) check (wind_mph is null or (wind_mph >= 0 and wind_mph < 100)),
  wind_direction text check (wind_direction is null or wind_direction in ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW')),
  temp_c numeric(4, 1) check (temp_c is null or (temp_c > -30 and temp_c < 50)),
  conditions text check (conditions is null or char_length(conditions) <= 300),
  -- Who and with what.
  operator text not null check (char_length(btrim(operator)) between 1 and 200),
  certificate text check (certificate is null or char_length(certificate) <= 100),
  equipment text check (equipment is null or char_length(equipment) <= 200),
  -- The day stock may go back, from the label's exclusion interval.
  stock_out_until date,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

comment on table public.spray_records is
  'Info > Spray diary: pesticide application records, one row per product applied. Owner-only via RLS.';

create index if not exists spray_records_user_date_idx
  on public.spray_records (user_id, sprayed_on desc, created_at desc);

alter table public.spray_records enable row level security;

create policy spray_records_select_own on public.spray_records
  for select to authenticated using (user_id = auth.uid());
create policy spray_records_insert_own on public.spray_records
  for insert to authenticated with check (user_id = auth.uid());
create policy spray_records_update_own on public.spray_records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy spray_records_delete_own on public.spray_records
  for delete to authenticated using (user_id = auth.uid());

-- Default privileges grant anon directly here (`revoke ... from public` is a
-- no-op); a spray diary has no anonymous readers or writers.
revoke all on public.spray_records from anon;
