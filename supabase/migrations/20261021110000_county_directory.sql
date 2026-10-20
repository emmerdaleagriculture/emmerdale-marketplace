-- ============================================================================
-- The county directory: Open members listed on the public county pages.
--
-- /paddock-maintenance/<county>, /hay-bales/<county> and /tractor-hire/
-- <county> now name the Open members covering the county, with a link to
-- their website and an enquiry button that goes to them alone. The
-- listing is part of the Open tier (clause 12): a member is listed while
-- their membership is live and they have not switched it off.
--
-- contractors.website and directory_blurb are theirs to fill in on the
-- dashboard; directory_listed is the switch (on by default, since the
-- listing is a benefit they pay for). The view is what the pages read,
-- through the service role: like county_coverage it is kept from anon and
-- authenticated, so nothing about who covers where is readable through
-- the API by anyone but us.
--
-- A customer's enquiry through a listing is a lead (source 'directory',
-- status 'direct') with the contractor it went to on leads.contractor_id,
-- and an email to that contractor (kind 'directory_enquiry') with the
-- customer's address as reply-to. services_only is carried so the paddock
-- page can leave out a supplier who takes no general work (as
-- county_coverage does); the hay and tractor pages filter by service.
-- ============================================================================

alter table public.contractors
  add column if not exists website text,
  add column if not exists directory_blurb text,
  add column if not exists directory_listed boolean not null default true;

alter table public.leads
  add column if not exists contractor_id uuid references public.contractors (id) on delete set null;
-- A directory enquiry is neither pending (nothing for an admin to publish)
-- nor converted (it became no job): its own status.
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check check (status in ('pending', 'converted', 'dismissed', 'direct'));

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
         ct.rating_count
    from counties c
    join contractor_counties cc on cc.county_id = c.id
    join contractors ct on ct.id = cc.contractor_id
   where ct.status = 'approved'
     and ct.vetted_at is not null
     and ct.directory_listed
     and contractor_tier(ct.id) = 'open'
     -- An address that bounces for good gets no invitations (20261003120000)
     -- and no enquiries either: the customer would be told it was sent.
     and not email_undeliverable(ct.email);

revoke all on public.county_directory from anon, authenticated;
grant select on public.county_directory to service_role;
