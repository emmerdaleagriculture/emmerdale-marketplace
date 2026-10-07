-- A suspended contractor can come back by taking out premium (2026-10-07).
--
-- Any contractor who was vetted (approved at some point) and is now
-- suspended is reinstated the moment a premium subscription starts, with
-- the full premium terms. If that membership later ends, they are suspended
-- again. Applications that were turned down (never vetted) cannot buy their
-- way in: suspending one refunds anything paid (refundUnapprovedPremium).
--
-- Only a subscription *starting* reinstates, never a renewal or a nightly
-- re-sync: otherwise suspending someone who already pays for premium would
-- be undone by the next sync. Such a member stays suspended until they buy
-- premium again.
--
-- premium_reinstated_at marks "back because of premium", which is what the
-- lapse rule acts on. An admin's own Reinstate clears it (setContractorStatus).

alter table public.contractors
  add column if not exists premium_reinstated_at timestamptz;

comment on column public.contractors.premium_reinstated_at is
  'Set when a suspended contractor was reinstated by starting premium; while set, premium ending suspends them again. Cleared by an admin status change.';

-- The status guard lets these two changes through without a service-role JWT
-- (a webhook has one; a psql session or cron may not).
create or replace function public.guard_contractor_columns()
 returns trigger
 language plpgsql
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or current_setting('sq.premium_status_change', true) = '1' then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'contractor status can only be changed by an admin';
  end if;
  if new.vetted_at is distinct from old.vetted_at and current_user in ('authenticated', 'anon') then
    raise exception 'contractor vetting can only be changed by an admin';
  end if;
  return new;
end;
$function$;

create or replace function public.subscriptions_premium_reinstatement()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c record;
  v_started boolean;
begin
  select id, business_name, status, vetted_at, premium_reinstated_at
    into c from contractors where id = new.contractor_id;
  if not found then
    return new;
  end if;

  v_started := new.status in ('active', 'past_due')
    and (tg_op = 'INSERT' or old.status is null or old.status not in ('active', 'past_due'));

  if v_started and c.status = 'suspended' and c.vetted_at is not null then
    perform set_config('sq.premium_status_change', '1', true);
    update contractors
       set status = 'approved', premium_reinstated_at = now()
     where id = c.id;
    perform set_config('sq.premium_status_change', '', true);
    insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
      jsonb_build_object(
        'subject', 'Suspended contractor back on premium — ' || c.business_name,
        'text', c.business_name || ' was suspended and has taken out premium, so their account is active again with the premium terms. If premium ends they are suspended again.' || E'\n\n' ||
                coalesce(current_setting('app.site_url', true), 'https://www.emmerdaleagriculture.com') || '/admin/contractors/' || c.id));

  elsif c.premium_reinstated_at is not null and c.status = 'approved'
        and not contractor_is_premium(c.id) then
    perform set_config('sq.premium_status_change', '1', true);
    update contractors
       set status = 'suspended', premium_reinstated_at = null
     where id = c.id;
    perform set_config('sq.premium_status_change', '', true);
    -- As the admin Suspend button does: their live prices come off too.
    update client_quotes set status = 'closed'
     where contractor_id = c.id and status = 'active';
    insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
      jsonb_build_object(
        'subject', 'Premium ended — ' || c.business_name || ' suspended again',
        'text', c.business_name || ' was back on the platform only because of premium. Their membership has ended, so they are suspended again and their live prices are closed.' || E'\n\n' ||
                coalesce(current_setting('app.site_url', true), 'https://www.emmerdaleagriculture.com') || '/admin/contractors/' || c.id));
  end if;

  return new;
end;
$function$;

revoke all on function public.subscriptions_premium_reinstatement() from public, anon, authenticated;

-- Every update, not only status changes: the nightly premium-sync rewrites
-- each row, which is what notices a past_due membership running out its
-- grace period (contractor_is_premium is time-based).
drop trigger if exists subscriptions_premium_reinstatement on public.subscriptions;
create trigger subscriptions_premium_reinstatement
  after insert or update on public.subscriptions
  for each row execute function public.subscriptions_premium_reinstatement();
