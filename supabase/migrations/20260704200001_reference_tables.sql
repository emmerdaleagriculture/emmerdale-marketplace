-- ============================================================================
-- Reference tables (spec §2) — canonical geography + service taxonomy.
-- Seeded separately in supabase/seed.sql.
-- ============================================================================

-- Ceremonial counties of England + preserved counties of Wales.
create table if not exists counties (
  id      serial primary key,
  name    text not null unique,          -- 'Hampshire', 'Wiltshire', ...
  region  text not null,                 -- 'South East', 'Wales', ... (grouped UI)
  country text not null default 'England'
);

-- Unitary-authority / district → ceremonial county fallback map.
-- postcodes.io returns admin_county = null for unitary authorities, so we look
-- up admin_district here. (spec §2.2)
create table if not exists district_county_map (
  admin_district text primary key,
  county_id      int not null references counties(id)
);

-- The confirmed 15-service taxonomy (spec §3).
create table if not exists services (
  id   serial primary key,
  name text not null unique
);
