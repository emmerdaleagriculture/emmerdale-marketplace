-- Tender watch: public-sector land contracts for Open members.
--
-- Ported from HPM's watcher (hpm-site dde829a, scope doc 12 Nov 2026), which
-- kept notices within 40 miles of Winchester in one Payload collection. Here
-- the watch is national and multi-member:
--
--   tenders            one national pool, written only by /api/cron/tender-watch
--                      (src/lib/tenders/watch.ts). Keyed on buyer + title, so one
--                      row follows a contract across re-lets (renewal → open →
--                      renewal). live_since is stamped whenever a row becomes
--                      open/pipeline, which is what makes it "new" again.
--   contractor_tenders what each member did with a row: status, notes, when they
--                      last saw it. The watcher never writes here.
--   sq_tenders_for()   the pool cut to one contractor's patch — the counties
--                      they cover, within their invite radius of base, the same
--                      patch as sq_area_jobs (market data). A notice with no
--                      county (Find a Tender buyer outside our county map) is
--                      on the patch when its coordinates are within the radius.
--
-- Open-only: the app checks the tier before calling either function, as the
-- market page does. Both tables are service-role only.

create table public.tenders (
  id             uuid primary key default gen_random_uuid(),
  source_key     text not null unique,
  source         text not null check (source in ('contracts_finder', 'find_a_tender')),
  notice_id      text,
  kind           text not null check (kind in ('open', 'pipeline', 'renewal')),
  fit            text not null default 'unsure' check (fit in ('rural', 'grounds', 'unsure')),
  title          text not null,
  buyer          text not null default '',
  description    text not null default '',
  url            text not null,
  published_at   timestamptz,
  deadline       timestamptz,
  contract_start timestamptz,
  contract_end   timestamptz,
  -- Open/pipeline: the submission deadline. Renewal: contract end minus
  -- RENEWAL_LEAD_MONTHS (4), so the member approaches the buyer before re-tender.
  action_by      timestamptz,
  value_low      numeric,
  value_high     numeric,
  incumbent      text,
  postcode       text,
  county_id      int references counties(id),
  lat            numeric,
  lng            numeric,
  cpv            text,
  matched        text,
  score          int not null default 0,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  live_since     timestamptz
);
comment on table public.tenders is
  'National pool of public-sector land contracts (Contracts Finder + Find a Tender), written by the tender-watch cron. Open members see their patch via sq_tenders_for().';
create index tenders_county_idx on public.tenders (county_id);
create index tenders_action_by_idx on public.tenders (action_by);

create table public.contractor_tenders (
  contractor_id uuid not null references contractors(id) on delete cascade,
  tender_id     uuid not null references tenders(id) on delete cascade,
  status        text check (status in ('interested', 'bidding', 'submitted', 'won', 'lost', 'no_bid')),
  notes         text check (char_length(notes) <= 2000),
  seen_at       timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (contractor_id, tender_id)
);
comment on table public.contractor_tenders is
  'An Open member''s own state on a tender: status, notes, last seen. Never written by the watcher.';

alter table public.tenders enable row level security;
alter table public.contractor_tenders enable row level security;
revoke all on public.tenders from public, anon, authenticated;
revoke all on public.contractor_tenders from public, anon, authenticated;
grant all on public.tenders to service_role;
grant all on public.contractor_tenders to service_role;

-- ── One member's list ──────────────────────────────────────────────────────
-- Live notices until a day past their deadline (a notice with no deadline
-- stays for 90 days from when it went live), and renewals while the contract
-- runs. is_new: live, and not seen since it went live, and not "no bid".
create or replace function public.sq_tenders_for(p_contractor_id uuid)
 returns table (
   id uuid, kind text, fit text, title text, buyer text, description text, url text,
   published_at timestamptz, deadline timestamptz, contract_start timestamptz,
   contract_end timestamptz, action_by timestamptz, value_low numeric, value_high numeric,
   incumbent text, postcode text, county text, distance_miles numeric, source text,
   status text, notes text, is_new boolean)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select t.id, t.kind, t.fit, t.title, t.buyer, t.description, t.url,
         t.published_at, t.deadline, t.contract_start, t.contract_end, t.action_by,
         t.value_low, t.value_high, t.incumbent,
         -- Outcode only: the buyer's full postcode is an office, not a site.
         split_part(t.postcode, ' ', 1) as postcode,
         c.name as county,
         case when t.lat is not null and ct.base_lat is not null
              then round(haversine_miles(t.lat, t.lng, ct.base_lat, ct.base_lng)) end as distance_miles,
         t.source,
         mt.status, mt.notes,
         (t.kind in ('open', 'pipeline')
           and (mt.seen_at is null or mt.seen_at < coalesce(t.live_since, t.first_seen_at))
           and mt.status is distinct from 'no_bid') as is_new
    from contractors ct
    join tenders t on (
           (t.county_id is not null
             and exists (select 1 from contractor_counties cc
                          where cc.contractor_id = ct.id and cc.county_id = t.county_id)
             and sq_in_invite_range(t.lat, t.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles))
        or (t.county_id is null
             and t.lat is not null and ct.base_lat is not null
             and haversine_miles(t.lat, t.lng, ct.base_lat, ct.base_lng)
                   <= coalesce(ct.invite_radius_miles, app_config_num('sq_invite_radius_miles', 40))))
    left join counties c on c.id = t.county_id
    left join contractor_tenders mt on mt.contractor_id = ct.id and mt.tender_id = t.id
   where ct.id = p_contractor_id
     and case when t.kind = 'renewal'
              then t.contract_end >= now()
              else coalesce(t.deadline, coalesce(t.live_since, t.first_seen_at) + interval '90 days')
                     >= now() - interval '1 day'
         end
$function$;
revoke execute on function public.sq_tenders_for(uuid) from public, anon, authenticated;
grant execute on function public.sq_tenders_for(uuid) to service_role;

-- The dashboard's count: live notices on the patch the member hasn't seen.
create or replace function public.sq_tender_attention(p_contractor_id uuid)
 returns int
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select count(*)::int from sq_tenders_for(p_contractor_id) where is_new
$function$;
revoke execute on function public.sq_tender_attention(uuid) from public, anon, authenticated;
grant execute on function public.sq_tender_attention(uuid) to service_role;

-- ── The member's switch ────────────────────────────────────────────────────
-- Account settings › Council tenders. Off hides the dashboard link and count
-- and the list itself; nothing is deleted. Only Open members can change it
-- (the form shows non-members the setting greyed out, linking to membership).
alter table public.contractors
  add column tenders_enabled boolean not null default true;
comment on column public.contractors.tenders_enabled is
  'Open members: show Council tenders (/account/tenders) and the dashboard count. Default on.';
