-- ============================================================================
-- The outside-the-UK prompt's counts, in SQL.
--
-- The prompt (components/abroad/AbroadPrompt) writes its shows, closes and
-- clicks to page_events as 'step' rows labelled abroad_prompt:*. Two things
-- follow for the admin page (/admin/abroad):
--
--   1. admin_country_counts (20261024180000) counted distinct session keys
--      over every page_events row, so each prompt row was a visit, and only
--      in the countries the prompt targets. The prompt now shares the
--      landing tracker's session key, and these rows are left out of the
--      visit count regardless.
--   2. The page read the prompt rows through the API and counted them in
--      JS: no index leads with label, so that was a scan of the whole table
--      per admin visit. admin_prompt_counts does it here, once, by country
--      and event.
-- ============================================================================

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
      from page_events pe, since
     where pe.created_at >= since.t
       and coalesce(pe.label, '') not like 'abroad_prompt:%'
     group by 1
  ),
  p as (
    select coalesce(jp.country, '??') as country,
           count(*) filter (where jp.outcome = 'ok') as parses_ok,
           count(*) filter (where jp.outcome = 'rejected'
                              and coalesce(jp.reason, '') <> 'outside_uk') as parses_rejected,
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

create or replace function public.admin_prompt_counts(p_days int default 28)
 returns table (country text, event text, n bigint)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(pe.country, '??') as country,
         substr(pe.label, length('abroad_prompt:') + 1) as event,
         count(*) as n
    from page_events pe
   where pe.kind = 'step'
     and pe.label like 'abroad_prompt:%'
     and pe.created_at >= now() - make_interval(days => greatest(1, p_days))
   group by 1, 2
$function$;
revoke execute on function public.admin_prompt_counts(int) from public, anon, authenticated;
grant execute on function public.admin_prompt_counts(int) to service_role;

-- The partial index the two queries lean on: the prompt's rows alone.
create index if not exists page_events_abroad_prompt_idx
  on public.page_events (created_at)
  where label like 'abroad_prompt:%';
