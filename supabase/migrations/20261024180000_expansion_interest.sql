-- ============================================================================
-- Worldwide, phase 0: measure before building.
--
-- Nothing records where a visitor is. Search Console says the overseas
-- traffic so far is blog readers (420 of 437 clicks in 90 days were UK, the
-- rest harrowing and subsoiling queries from Ireland, Australia and New
-- Zealand), but a visitor who reached /start from abroad and gave up is
-- invisible: no postcode matches, the confirm step offers every UK county,
-- and nothing says why they left. Three things, none of them a feature:
--
--   1. page_events.country and job_parse_events.country: the two-letter
--      country Vercel puts on every request (x-vercel-ip-country). Per row,
--      like the attribution columns, because both tables are read a row at
--      a time. Null when the header is missing (local dev).
--   2. expansion_interest: customers and contractors outside the UK who ask
--      to be told when we open where they are, from /outside-the-uk. Which
--      side they are on, where, what work, how to reach them. This is the
--      waiting list a country opens against.
--   3. The /start parse now refuses coordinates outside the British Isles
--      with a pointer to that page (reason 'outside_uk' in job_parse_events)
--      instead of asking the customer to pick a UK county for land in Texas.
--
-- Admin reads all three at /admin/seo/countries beside Search Console's own
-- country split.
-- ============================================================================

alter table public.page_events add column if not exists country text
  check (country is null or country ~ '^[A-Z]{2}$');
alter table public.job_parse_events add column if not exists country text
  check (country is null or country ~ '^[A-Z]{2}$');

create table if not exists public.expansion_interest (
  id            bigint generated always as identity primary key,
  side          text not null check (side in ('customer', 'contractor')),
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  country_name  text not null,
  place         text,
  details       text,
  email         text not null,
  ip_country    text check (ip_country is null or ip_country ~ '^[A-Z]{2}$'),
  source_path   text,
  created_at    timestamptz not null default now()
);
create index if not exists expansion_interest_country_idx
  on public.expansion_interest (country_code, side);

alter table public.expansion_interest enable row level security;
revoke all on public.expansion_interest from public, anon, authenticated;
grant all on public.expansion_interest to service_role;

-- Visitors, parses and refusals by country over the last p_days, for the
-- admin page. Counted in SQL: page_events is far past the PostgREST row cap.
create or replace function public.admin_country_counts(p_days int default 28)
 returns table (
   country         text,
   visits          bigint,
   parses_ok       bigint,
   parses_rejected bigint,
   outside_uk      bigint,
   interest        bigint
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with since as (select now() - make_interval(days => greatest(1, p_days)) as t),
  v as (
    select coalesce(pe.country, '??') as country, count(distinct pe.session_key) as visits
      from page_events pe, since where pe.created_at >= since.t group by 1
  ),
  p as (
    select coalesce(jp.country, '??') as country,
           count(*) filter (where jp.outcome = 'ok') as parses_ok,
           count(*) filter (where jp.outcome = 'rejected') as parses_rejected,
           count(*) filter (where jp.reason = 'outside_uk') as outside_uk
      from job_parse_events jp, since where jp.created_at >= since.t group by 1
  ),
  i as (
    select coalesce(ei.ip_country, '??') as country, count(*) as interest
      from expansion_interest ei, since where ei.created_at >= since.t group by 1
  )
  select c.country,
         coalesce(v.visits, 0), coalesce(p.parses_ok, 0), coalesce(p.parses_rejected, 0),
         coalesce(p.outside_uk, 0), coalesce(i.interest, 0)
    from (select country from v union select country from p union select country from i) c
    left join v using (country) left join p using (country) left join i using (country)
   order by coalesce(v.visits, 0) desc, c.country
$function$;
revoke execute on function public.admin_country_counts(int) from public, anon, authenticated;
grant execute on function public.admin_country_counts(int) to service_role;
