-- ============================================================================
-- Views, helper functions, and security-definer RPCs (spec §3, §4, §5).
--
-- Privacy model: contractors CANNOT select the `jobs` base table at all (no RLS
-- select policy). Non-PII job data reaches them only through the `public_jobs`
-- view; customer PII only through get_job_contact(). Both are owned by the
-- migration role and run security-definer so they can read `jobs` while the base
-- table stays sealed.
-- ============================================================================

-- ── Admin claim ─────────────────────────────────────────────────────────────
-- Admin is carried as an `is_admin` boolean in the user's JWT app_metadata,
-- stamped by a server route on login for emails in ADMIN_EMAILS (documented in
-- README / spec §12.5). SQL reads it here for optional policy use.
create or replace function is_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
$$;

-- ── Subscription gating (spec §5) ───────────────────────────────────────────
create or replace function is_active_subscriber(p_contractor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from subscriptions s
    where s.contractor_id = p_contractor
      and (s.status = 'active'
           or (s.status = 'canceled'
               and s.current_period_end is not null
               and s.current_period_end > now()))
  );
$$;

-- ── public_jobs view (spec §3) ──────────────────────────────────────────────
-- Open, consented jobs only; no full postcode, no customer fields. Readable
-- only by an approved contractor (enforced in the WHERE clause; the view is
-- security-definer so it bypasses RLS on the sealed jobs table).
create or replace view public_jobs
with (security_invoker = false) as
select
  j.id,
  j.title,
  j.description,
  j.service_ids,
  j.postcode_district,
  j.town,
  j.county_id,
  c.name              as county,
  j.budget_hint,
  j.bidding_closes_at,
  (select count(*) from bids b where b.job_id = j.id) as bid_count
from jobs j
join counties c on c.id = j.county_id
where j.status = 'open'
  and j.consent_to_share = true
  and exists (
    select 1 from contractors ct
    where ct.id = auth.uid() and ct.status = 'approved'
  );

-- ── get_job_contact RPC (spec §3, §5) ───────────────────────────────────────
-- Returns customer PII if the caller already has a contact_reveals row for the
-- job, OR is an active subscriber (in which case it inserts the reveal with
-- route 'paid_access', then returns). Refuses everything else. Requires consent.
create or replace function get_job_contact(p_job_id uuid)
returns table (customer_name text, customer_phone text, customer_email text)
language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid := auth.uid();
  v_consent    boolean;
  v_has_reveal boolean;
begin
  if v_contractor is null then
    raise exception 'not authenticated';
  end if;

  select j.consent_to_share into v_consent from jobs j where j.id = p_job_id;
  if v_consent is null then
    raise exception 'job not found';
  end if;
  if not v_consent then
    raise exception 'no consent to share for this job';
  end if;

  select exists (
    select 1 from contact_reveals cr
    where cr.job_id = p_job_id and cr.contractor_id = v_contractor
  ) into v_has_reveal;

  if not v_has_reveal and is_active_subscriber(v_contractor) then
    insert into contact_reveals (job_id, contractor_id, route)
      values (p_job_id, v_contractor, 'paid_access')
      on conflict (job_id, contractor_id) do nothing;
    v_has_reveal := true;
  end if;

  if not v_has_reveal then
    raise exception 'no access to contact details for this job';
  end if;

  return query
    select j.customer_name, j.customer_phone, j.customer_email
    from jobs j where j.id = p_job_id;
end;
$$;

-- ── open_due_jobs() (spec §4) ───────────────────────────────────────────────
-- Flip exclusive → open at bidding_opens_at; queue free-tier notifications
-- exactly once (job_notifications PK guards idempotency across cron overlaps).
create or replace function open_due_jobs()
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; r_ct record;
begin
  for r_job in
    select * from jobs
    where status = 'exclusive' and bidding_opens_at <= now()
    for update skip locked
  loop
    update jobs set status = 'open' where id = r_job.id;

    for r_ct in
      select distinct ct.id, ct.email
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
      where cc.county_id = r_job.county_id
        and ct.status = 'approved'
        and ct.notify_new_jobs = true
    loop
      insert into job_notifications (job_id, contractor_id, kind)
        values (r_job.id, r_ct.id, 'new_job')
        on conflict (job_id, contractor_id, kind) do nothing;
      if found then
        insert into pending_emails (kind, to_email, payload)
          values ('new_job', r_ct.email, jsonb_build_object(
            'job_id', r_job.id, 'contractor_id', r_ct.id,
            'title', r_job.title, 'town', r_job.town,
            'postcode_district', r_job.postcode_district,
            'county_id', r_job.county_id, 'closes_at', r_job.bidding_closes_at));
      end if;
    end loop;
  end loop;
end;
$$;

-- ── close_due_jobs() (spec §4) ──────────────────────────────────────────────
-- At bidding_closes_at: auto-award lowest bid (tie → earliest created_at),
-- reveal contact to the winner, queue winner/loser emails. No bids → expired.
-- Only touches status='open', so a manual award (which sets 'awarded') is
-- short-circuited automatically (acceptance #5).
create or replace function close_due_jobs()
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; r_win record; r_lose record;
begin
  for r_job in
    select * from jobs
    where status = 'open' and bidding_closes_at <= now()
    for update skip locked
  loop
    select * into r_win from bids
    where job_id = r_job.id
    order by amount_pence asc, created_at asc
    limit 1;

    if r_win.id is null then
      update jobs set status = 'expired' where id = r_job.id;
      insert into pending_emails (kind, to_email, payload)
        values ('job_expired', '__admin__',
                jsonb_build_object('job_id', r_job.id, 'title', r_job.title));
    else
      update jobs set status = 'awarded', awarded_bid_id = r_win.id where id = r_job.id;

      insert into contact_reveals (job_id, contractor_id, route)
        values (r_job.id, r_win.contractor_id, 'bid_won')
        on conflict (job_id, contractor_id) do nothing;

      insert into pending_emails (kind, to_email, payload)
        select 'bid_won', ct.email, jsonb_build_object(
          'job_id', r_job.id, 'title', r_job.title,
          'amount_pence', r_win.amount_pence,
          'customer_name', r_job.customer_name,
          'customer_phone', r_job.customer_phone,
          'customer_email', r_job.customer_email,
          'paid_reveal_count', (select count(*) from contact_reveals cr
                                 where cr.job_id = r_job.id and cr.route = 'paid_access'))
        from contractors ct where ct.id = r_win.contractor_id;

      for r_lose in
        select ct.email from bids b
        join contractors ct on ct.id = b.contractor_id
        where b.job_id = r_job.id and b.contractor_id <> r_win.contractor_id
      loop
        insert into pending_emails (kind, to_email, payload)
          values ('bid_lost', r_lose.email,
                  jsonb_build_object('job_id', r_job.id, 'title', r_job.title));
      end loop;
    end if;
  end loop;
end;
$$;

-- ── award_job() — admin manual award (spec §4) ──────────────────────────────
-- Service-role only. Awards a specific (not necessarily lowest) bid, reveals to
-- that contractor, and queues emails. Idempotent-ish: refuses if not 'open'.
create or replace function award_job(p_job_id uuid, p_bid_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; r_bid record; r_lose record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'award_job is service-role only';
  end if;

  select * into r_job from jobs where id = p_job_id for update;
  if r_job.id is null then raise exception 'job not found'; end if;
  if r_job.status <> 'open' then
    raise exception 'job is not open (status=%)', r_job.status;
  end if;

  select * into r_bid from bids where id = p_bid_id and job_id = p_job_id;
  if r_bid.id is null then raise exception 'bid not found for this job'; end if;

  update jobs set status = 'awarded', awarded_bid_id = r_bid.id where id = p_job_id;

  insert into contact_reveals (job_id, contractor_id, route)
    values (p_job_id, r_bid.contractor_id, 'bid_won')
    on conflict (job_id, contractor_id) do nothing;

  insert into pending_emails (kind, to_email, payload)
    select 'bid_won', ct.email, jsonb_build_object(
      'job_id', p_job_id, 'title', r_job.title, 'amount_pence', r_bid.amount_pence,
      'customer_name', r_job.customer_name, 'customer_phone', r_job.customer_phone,
      'customer_email', r_job.customer_email,
      'paid_reveal_count', (select count(*) from contact_reveals cr
                             where cr.job_id = p_job_id and cr.route = 'paid_access'))
    from contractors ct where ct.id = r_bid.contractor_id;

  for r_lose in
    select ct.email from bids b
    join contractors ct on ct.id = b.contractor_id
    where b.job_id = p_job_id and b.contractor_id <> r_bid.contractor_id
  loop
    insert into pending_emails (kind, to_email, payload)
      values ('bid_lost', r_lose.email,
              jsonb_build_object('job_id', p_job_id, 'title', r_job.title));
  end loop;
end;
$$;
