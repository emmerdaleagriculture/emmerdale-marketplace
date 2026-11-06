-- ============================================================================
-- Ticked services filter jobs for every contractor.
--
-- Until now routing was county + distance only, and contractors.services was
-- consulted only for services_only contractors (20261009120000). A contractor
-- with seven services ticked was still invited to harrowing, topping and
-- fencing (a contractor's complaint, 2026-11-05). Now:
--
--   job has a service        only contractors who tick it, or tick one of
--   (service_id, plus        the extras the customer also asked for
--    also_service_ids)       (also_service_ids)
--   nobody covering the      every contractor in the county, as before, so
--   county ticks it          a rare service never goes to no one
--   job has no service_id    every contractor in range, as before
--   contractor ticks nothing treated as "no preference": every job, as before
--
-- The keyword labeller (service_label_from_text) is NOT used for this: it
-- matches substrings ("Haywards Heath" reads as hay) and was only ever safe
-- as a hint. It stays in use for services_only (strict) contractors exactly
-- as before, where a job with no service_id is labelled or skipped.
--
-- So services_only now means only "strict": also skip jobs that can't be
-- matched to a service. "Cover the whole country" still needs it, or every
-- unmatched job in the country would reach them.
--
-- Every market path (distribute_submission, open_submission_to_market,
-- invite_contractor_to_open_jobs, sq_premium_candidates,
-- sq_members_first_notice, sq_invitation_reminder_tick, sq_area_jobs,
-- sq_weekly_digest_payload) already asks sq_contractor_wants_job, so this
-- one function is the switch. Invitations already sent are not withdrawn.
--
-- Measured before switching, on the 134 jobs distributed in the 60 days to
-- 2026-11-05: 610 of 3,034 invitations (20%) would not have been sent;
-- median invitees per job 25 → 18.5; no job with zero invitees; 42 priced
-- invitations would not have been sent, none of which won the job.
--
-- The rule lives in one place, sq_contractor_wants_service, which both
-- sq_contractor_wants_job (invitations) and sq_coverage_count (the public
-- "N contractors cover SO51" figure) call, so the two can't drift. And
-- sq_backfill_new_services is the one way to tick new services for
-- existing contractors (see its comment).
-- ============================================================================

-- Does this contractor want work of these services, in this county?
-- p_service_ids empty: no service to judge by.
create or replace function public.sq_contractor_wants_service(p_ct contractors, p_service_ids int[], p_county_id int)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select case
    -- No service to judge by, or a contractor who ticks nothing: as before,
    -- every contractor except the strict ones.
    when cardinality(coalesce(p_service_ids, '{}')) = 0
      or cardinality(coalesce(p_ct.services, '{}')) = 0
      then not coalesce(p_ct.services_only, false)
    when coalesce(p_ct.services, '{}') && p_service_ids then true
    when coalesce(p_ct.services_only, false) then false
    -- Nobody covering the county ticks it: fall back to everyone there
    -- rather than send the customer a no-matches email.
    else not exists (
      select 1
        from contractor_counties cc
        join contractors o on o.id = cc.contractor_id
       where cc.county_id = p_county_id
         and o.status = 'approved'
         and o.vetted_at is not null
         and coalesce(o.services, '{}') && p_service_ids)
  end
$function$;

create or replace function public.sq_contractor_wants_job(p_ct contractors, p_js job_submissions)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select case
    -- Strict contractors keep the 20261009120000 behaviour: a job with no
    -- service_id is judged by the keyword labeller, and skipped if it says
    -- nothing they tick.
    when coalesce(p_ct.services_only, false) and p_js.service_id is null then
      exists (
        select 1 from services s
         where s.id = any(coalesce(p_ct.services, '{}'::int[]))
           and (s.name = service_label_from_text(
                           concat_ws(' ', p_js.service_verbatim, p_js.raw_text, p_js.details_text))
                or s.id = any(coalesce(p_js.also_service_ids, '{}'::int[]))))
    else sq_contractor_wants_service(
           p_ct,
           array_remove(array[p_js.service_id] || coalesce(p_js.also_service_ids, '{}'::int[]), null),
           p_js.county_id)
  end
$function$;

create or replace function public.sq_coverage_count(p_county_id integer, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_service_name text DEFAULT NULL::text)
 returns integer
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select count(*)::int
    from contractors ct
    join contractor_counties cc on cc.contractor_id = ct.id
   where cc.county_id = p_county_id
     and ct.status = 'approved'
     and ct.vetted_at is not null
     and sq_in_invite_range(p_lat, p_lng, ct.base_lat, ct.base_lng,
                        sq_invite_radius(ct.invite_radius_miles, (select s.id from services s where s.name = p_service_name)))
     -- The invitation rule itself. With no service named (free text not yet
     -- classified) this counts everyone a job with no service would reach;
     -- the classified job may reach fewer.
     and sq_contractor_wants_service(
           ct,
           coalesce((select array[s.id] from services s where s.name = p_service_name), '{}'::int[]),
           p_county_id);
$function$;

-- Tick newly added services for existing contractors. Now that ticks route
-- jobs and new sign-ups choose their own (PR #296), a blanket append would
-- claim work for contractors who deliberately picked a short list. Instead
-- each new service goes to:
--   * contractors who already tick every service EXCEPT the new ones (they
--     never trimmed, so "everything" is still their answer), and
--   * contractors who tick p_like, a close existing service (the same kit),
--     when one is given.
-- Pass every service a migration adds in one call, or each would count the
-- others as "not ticked" and reach no one. services_only contractors are
-- never touched. Returns how many contractors changed.
create or replace function public.sq_backfill_new_services(p_services text[], p_like text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_new int[];
  v_like int;
  v_others int[];
  v_n int;
begin
  select coalesce(array_agg(id), '{}') into v_new from services where name = any(p_services);
  if cardinality(v_new) <> cardinality(p_services) then
    raise exception 'not every service exists: %', p_services;
  end if;
  if p_like is not null then
    select id into v_like from services where name = p_like;
    if v_like is null then
      raise exception 'no service named %', p_like;
    end if;
  end if;
  select coalesce(array_agg(id), '{}') into v_others from services where not (id = any(v_new));

  update contractors k
     set services = (select array_agg(distinct x order by x)
                       from unnest(coalesce(k.services, '{}'::int[]) || v_new) as t(x))
   where not coalesce(k.services_only, false)
     and not (coalesce(k.services, '{}'::int[]) @> v_new)
     and (coalesce(k.services, '{}'::int[]) @> v_others
          or (v_like is not null and v_like = any(coalesce(k.services, '{}'::int[]))));
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function public.sq_backfill_new_services(text[], text) from public, anon, authenticated;
