-- ============================================================================
-- The Monday round-up also carries what the contractor owes a reply to:
-- customers' unread messages, and booked jobs with a next step — confirm or
-- revise after a site visit, mark it done, or send the invoice to be paid.
-- Redefines sq_weekly_digest_payload (20260930180000); nothing else changes.
-- ============================================================================

-- One contractor's round-up, or null when there is nothing to tell them.
create or replace function sq_weekly_digest_payload(p_contractor_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ct        contractors%rowtype;
  v_jobs      jsonb;
  v_open      int;
  v_area_new  int;
  v_counties  text[];
  v_national  int;
  v_messages  jsonb;
  v_won       jsonb;
begin
  select * into v_ct from contractors where id = p_contractor_id;
  if not found then return null; end if;

  select coalesce(jsonb_agg(j order by j->>'expires_at'), '[]'::jsonb), count(*)
    into v_jobs, v_open
    from (
      select jsonb_build_object(
               'service', sq_service_label(js.service_id, js.service_verbatim),
               'postcode_district', split_part(js.postcode, ' ', 1),
               'county', c.name,
               'acres', coalesce(js.area_mapped_value,
                                 case js.area_unit when 'acres' then js.area_value
                                                   when 'hectares' then round(js.area_value * 2.47105, 1) end),
               'distance_miles', ji.distance_miles,
               'expires_at', js.expires_at,
               'prices_so_far', (select count(distinct q.contractor_id) from contractor_quotes q
                                  where q.submission_id = js.id and q.confirmed_by_contractor),
               'token', ji.token) as j
        from job_invitations ji
        join job_submissions js on js.id = ji.submission_id
        left join counties c on c.id = js.county_id
       where ji.contractor_id = p_contractor_id
         and ji.status in ('sent', 'viewed')
         and js.status in ('distributed', 'quotes_receiving')
         and js.hidden_at is null
         and js.expires_at > now() + interval '12 hours'
         and sq_in_invite_range(js.lat, js.lng, v_ct.base_lat, v_ct.base_lng, v_ct.invite_radius_miles)
       order by js.expires_at
       limit 10
    ) t;

  select count(*) into v_area_new
    from job_submissions js
   where js.county_id in (select county_id from contractor_counties where contractor_id = p_contractor_id)
     and js.distributed_at > now() - interval '7 days'
     and js.hidden_at is null;

  select array_agg(name order by name) into v_counties
    from (select c.name from contractor_counties cc join counties c on c.id = cc.county_id
           where cc.contractor_id = p_contractor_id order by c.name limit 4) x;

  select count(*) into v_national from job_submissions
   where status in ('distributed', 'quotes_receiving') and hidden_at is null and expires_at > now();

  -- Customers waiting on a reply: unread messages in threads still open.
  -- Held messages are the moderator's, not the contractor's, so they are
  -- left out, exactly as the page leaves them out.
  select coalesce(jsonb_agg(m order by m->>'last_at' desc), '[]'::jsonb) into v_messages
    from (
      select jsonb_build_object(
               'service', sq_service_label(js.service_id, js.service_verbatim),
               'postcode_district', split_part(js.postcode, ' ', 1),
               'from', case when sq_thread_state(ji.id) = 'post_award'
                            then coalesce(split_part(js.contact_name, ' ', 1), 'The customer')
                            else 'The customer' end,
               'unread', count(*),
               'last_at', max(jm.created_at),
               'snippet', left((array_agg(jm.body order by jm.created_at desc))[1], 120),
               'token', ji.token) as m
        from job_messages jm
        join job_invitations ji on ji.id = jm.invitation_id
        join job_submissions js on js.id = jm.submission_id
       where ji.contractor_id = p_contractor_id
         and jm.sender = 'client' and jm.read_at is null
         and coalesce(jm.moderation, 'approved') = 'approved'
         and sq_thread_state(ji.id) <> 'closed'
       group by ji.id, ji.token, js.id
       limit 10
    ) t;

  -- Booked jobs with something for them to do, and what it is.
  select coalesce(jsonb_agg(w order by w->>'awarded_at' desc), '[]'::jsonb) into v_won
    from (
      select jsonb_build_object(
               'service', sq_service_label(js.service_id, js.service_verbatim),
               'customer', split_part(coalesce(js.contact_name, 'the customer'), ' ', 1),
               'postcode_district', split_part(js.postcode, ' ', 1),
               'awarded_at', js.awarded_at,
               'next', case
                 when js.visit_status = 'awaiting_visit' then 'visit'
                 when js.status in ('completed', 'paid') then 'invoice'
                 else 'mark_done' end,
               'due_at', js.visit_due_at) as w
        from job_submissions js
       where js.awarded_contractor_id = p_contractor_id
         and (
           js.status in ('awarded', 'contacted', 'scheduled', 'in_progress')
           or (js.status in ('completed', 'paid') and js.contractor_invoice_path is null
               and not exists (select 1 from contractor_payouts cp where cp.submission_id = js.id))
         )
       limit 10
    ) t;

  if v_open = 0 and v_area_new = 0
     and jsonb_array_length(v_messages) = 0 and jsonb_array_length(v_won) = 0 then
    return null;
  end if;

  return jsonb_build_object(
    'business_name', v_ct.business_name,
    'contact_name', v_ct.contact_name,
    'jobs', v_jobs,
    'open_count', v_open,
    'area_new', v_area_new,
    'counties', to_jsonb(coalesce(v_counties, '{}')),
    'county_count', (select count(*) from contractor_counties where contractor_id = p_contractor_id),
    'national_open', v_national,
    'messages', v_messages,
    'won', v_won);
end;
$$;

revoke execute on function sq_weekly_digest_payload(uuid) from public, anon, authenticated;
grant  execute on function sq_weekly_digest_payload(uuid) to service_role;
