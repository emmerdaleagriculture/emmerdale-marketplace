-- Contractor profile pictures (2026-11-17).
--
-- A contractor uploads a logo or photo on /account/settings. The app resizes
-- it to a 400px square WebP (which also strips EXIF, GPS included) and stores
-- it in a public bucket; the path lives on the contractor row. It is shown on
-- their dashboard, in Find a contractor and on county pages, and beside their
-- price on the customer's price list (the customer gets the image URL only,
-- never the contractor id: see getClientQuotes).
--
-- Uploads go through a server action with the service role, so the bucket
-- needs no insert/update policies; reads are by public URL.

alter table public.contractors
  add column if not exists avatar_path text;

comment on column public.contractors.avatar_path is
  'Profile picture: object path in the contractor-avatars bucket (public). Null = none; the UI falls back to an initial.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contractor-avatars', 'contractor-avatars', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The directory carries the picture too. Same definition as live, with
-- avatar_path appended (create or replace may only add columns at the end).
create or replace view public.county_directory as
  select c.name as county,
         ct.id as contractor_id,
         ct.business_name,
         ct.email,
         ct.website,
         ct.directory_blurb,
         ct.services,
         coalesce(ct.services_only, false) as services_only,
         ct.rating_avg,
         ct.rating_count,
         ct.avatar_path
    from counties c
    join contractor_counties cc on cc.county_id = c.id
    join contractors ct on ct.id = cc.contractor_id
   where ct.status = 'approved'
     and ct.vetted_at is not null
     and ct.directory_listed
     and contractor_tier(ct.id) = 'open'
     and not email_undeliverable(ct.email);

revoke all on public.county_directory from anon, authenticated;
