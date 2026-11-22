-- Home page hero split test, phones only (22 Nov 2026).
--
-- 4 in 10 phone visitors left the home page before the quote form came on
-- screen: it sat 1,013px down, under the kicker, a four-line headline, the
-- standfirst and three promises. Arm B moves the form up under a smaller
-- headline and puts the standfirst and promises beneath it. Arm A is the page
-- as it was. The header, banner image and yellow ticker are the same in both.
--
-- The arm is chosen in the browser (src/lib/homeSplit.ts) and kept in
-- localStorage, so the page stays statically cached. It rides on the
-- landing beacon as `variant`, on every row of the visit.

alter table page_events add column if not exists variant text
  check (variant in ('a', 'b'));

create index if not exists page_events_variant_idx
  on page_events (session_key) where variant is not null;

-- One row per arm: phone visits to / that carried an arm, and how far each
-- got. "Sent" joins on the tab's session key to /start, where the job
-- itself is confirmed. A tab is one visit: sessionStorage, not a person.
create or replace function admin_home_split_summary(p_days int default 30)
returns jsonb
language sql stable security definer set search_path = public as $$
  with home as (
    select session_key,
           max(variant) as variant,
           bool_or(utm_source is not null or has_gclid) as from_ad,
           max(depth_pct) filter (where kind = 'depth') as depth,
           bool_or(kind = 'step' and label = 'form_seen') as saw_form,
           bool_or(kind = 'step' and label = 'start_quote') as started,
           min(created_at) as at
      from page_events
     where path = '/'
       and variant is not null
       and created_at > now() - make_interval(days => p_days)
     group by session_key
  ),
  sent as (
    select distinct session_key
      from page_events
     where path = '/start' and kind = 'step' and label = 'sent'
       and created_at > now() - make_interval(days => p_days)
  ),
  per as (
    select h.variant,
           h.from_ad,
           h.depth,
           h.saw_form,
           h.started,
           (s.session_key is not null) as sent,
           h.at
      from home h left join sent s using (session_key)
  ),
  arms as (
    select variant,
           jsonb_build_object(
             'visits', count(*),
             'saw_form', count(*) filter (where saw_form),
             'started', count(*) filter (where started),
             'sent', count(*) filter (where sent),
             'median_depth', percentile_cont(0.5) within group (order by depth),
             'ad_visits', count(*) filter (where from_ad),
             'ad_saw_form', count(*) filter (where from_ad and saw_form),
             'ad_started', count(*) filter (where from_ad and started),
             'ad_sent', count(*) filter (where from_ad and sent)
           ) as stats
      from per
     group by variant
  )
  select jsonb_build_object(
    'days', p_days,
    'since', (select min(at) from per),
    'arms', coalesce((select jsonb_object_agg(variant, stats) from arms), '{}'::jsonb)
  );
$$;

revoke execute on function admin_home_split_summary(int) from public, anon, authenticated;
grant  execute on function admin_home_split_summary(int) to service_role;
