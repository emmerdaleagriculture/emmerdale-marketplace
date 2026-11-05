-- ============================================================================
-- Ticked services filter jobs for every contractor.
--
-- Until now routing was county + distance only, and contractors.services was
-- consulted only for services_only contractors (20261009120000). A contractor
-- with seven services ticked was still invited to harrowing, topping and
-- fencing (a contractor's complaint, 2026-11-05). Now:
--
--   job's service known      only contractors who tick it
--   (service_id, else the
--    keyword labeller)
--   job's service unknown    every contractor in range, as before, except
--                            services_only ones, who stay strict
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
-- Also: sq_coverage_count asked for a named service counts only contractors
-- who tick it; and sq_backfill_new_service is the one way to tick a new
-- service for existing contractors (see its comment).
-- ============================================================================

create or replace function public.sq_contractor_wants_job(p_ct contractors, p_js job_submissions)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  with job as (
    select coalesce(
             p_js.service_id,
             (select s.id from services s
               where s.name = service_label_from_text(
                       concat_ws(' ', p_js.service_verbatim, p_js.raw_text, p_js.details_text)))
           ) as service_id
  )
  select case
    when job.service_id is null then not coalesce(p_ct.services_only, false)
    else job.service_id = any(coalesce(p_ct.services, '{}'::int[]))
  end
  from job
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
     -- The same rule as sq_contractor_wants_job: a named service must be
     -- ticked; with none named, services_only contractors aren't counted.
     and case
           when p_service_name is null then not coalesce(ct.services_only, false)
           else exists (select 1 from services s
                         where s.name = p_service_name
                           and s.id = any(coalesce(ct.services, '{}'::int[])))
         end;
$function$;

-- Tick a newly added service for existing contractors. Now that ticks route
-- jobs and new sign-ups choose their own (PR #296), a blanket append would
-- claim work for contractors who deliberately picked a short list. Instead
-- it goes to:
--   * contractors who already tick every other service (they never trimmed,
--     so "everything" is still their answer), and
--   * contractors who tick p_like, a close existing service (the same kit),
--     when one is given.
-- services_only contractors are never touched. Returns how many changed.
create or replace function public.sq_backfill_new_service(p_service text, p_like text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_new int;
  v_like int;
  v_others int[];
  v_n int;
begin
  select id into v_new from services where name = p_service;
  if v_new is null then
    raise exception 'no service named %', p_service;
  end if;
  if p_like is not null then
    select id into v_like from services where name = p_like;
    if v_like is null then
      raise exception 'no service named %', p_like;
    end if;
  end if;
  select coalesce(array_agg(id), '{}') into v_others from services where id <> v_new;

  update contractors k
     set services = (select array_agg(distinct x order by x)
                       from unnest(coalesce(k.services, '{}'::int[]) || v_new) as t(x))
   where not coalesce(k.services_only, false)
     and not (v_new = any(coalesce(k.services, '{}'::int[])))
     and (coalesce(k.services, '{}'::int[]) @> v_others
          or (v_like is not null and v_like = any(coalesce(k.services, '{}'::int[]))));
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function public.sq_backfill_new_service(text, text) from public, anon, authenticated;
