-- ============================================================================
-- Review fixes for the app stack (PRs #221–#228).
--
-- 1. phone_verified_at was writable by the account holder: the own-row update
--    policies allow any column, so a PATCH through PostgREST could stamp a
--    number as verified without a text. Only the service role may set it,
--    and a changed number loses the stamp whoever changes it.
-- 2. The phone step had no ceiling on texts per person: a free account could
--    alternate numbers every five seconds. phone_verifications now counts
--    sends per day.
-- ============================================================================

create or replace function public.guard_phone_verified()
 returns trigger
 language plpgsql
as $function$
begin
  -- Anyone but the service role: keep the old stamp, or lose it with the number.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role'
     and current_user <> 'postgres' then
    new.phone_verified_at := case
      when new.phone is distinct from old.phone then null
      else old.phone_verified_at
    end;
  elsif new.phone is distinct from old.phone and new.phone_verified_at is not distinct from old.phone_verified_at then
    -- The service role changed the number without saying it was verified: it isn't.
    new.phone_verified_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists customers_guard_phone_verified on public.customers;
create trigger customers_guard_phone_verified
  before update on public.customers
  for each row execute function public.guard_phone_verified();

drop trigger if exists contractors_guard_phone_verified on public.contractors;
create trigger contractors_guard_phone_verified
  before update on public.contractors
  for each row execute function public.guard_phone_verified();

alter table public.phone_verifications
  add column if not exists sends_today integer not null default 0,
  add column if not exists sends_day date;
