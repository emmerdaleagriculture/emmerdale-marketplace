-- ============================================================================
-- Contractor screens in the app (PRD task 9).
--
-- 1. Applying from the app adds the checks the website never asked for:
--    the insurance certificate (a photo or PDF), optional certificates, where
--    to pay them, and which Code of Conduct they agreed to. Documents go in a
--    private bucket; bank details in a table only the service role reads.
-- 2. "Start job" moves a booked job to in_progress — a state the machine
--    already has but nothing contractor-facing set.
-- 3. Before-and-after photos of the work, taken in the app; the customer
--    sees them when they sign off.
-- ============================================================================

alter table public.contractors
  add column if not exists insurance_path text,
  add column if not exists certificate_paths text[] not null default '{}',
  add column if not exists conduct_version text,
  add column if not exists conduct_accepted_at timestamptz;

create table if not exists public.contractor_bank_details (
  contractor_id   uuid primary key references public.contractors(id) on delete cascade,
  account_name    text not null,
  sort_code       text not null,
  account_number  text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.contractor_bank_details enable row level security;
revoke all on public.contractor_bank_details from public, anon, authenticated;
grant all on public.contractor_bank_details to service_role;

create table if not exists public.job_work_photos (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.job_submissions(id) on delete cascade,
  contractor_id  uuid not null references public.contractors(id),
  phase          text not null check (phase in ('before', 'after')),
  path           text not null,
  created_at     timestamptz not null default now()
);
create index if not exists job_work_photos_submission_idx on public.job_work_photos (submission_id, phase, created_at);
alter table public.job_work_photos enable row level security;
revoke all on public.job_work_photos from public, anon, authenticated;
grant all on public.job_work_photos to service_role;

-- Private: insurance certificates and the like, read through signed URLs.
insert into storage.buckets (id, name, public)
values ('contractor-documents', 'contractor-documents', false)
on conflict (id) do nothing;

-- The contractor starts the booked job. awarded / contacted / scheduled →
-- in_progress; anything else is left alone and reported.
create or replace function public.sq_start_job(p_submission_id uuid, p_contractor_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_status text;
begin
  select status into v_status
    from job_submissions
   where id = p_submission_id and awarded_contractor_id = p_contractor_id
   for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  if v_status = 'in_progress' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_status not in ('awarded', 'contacted', 'scheduled') then
    return jsonb_build_object('ok', false, 'reason', 'status:' || v_status);
  end if;
  update job_submissions set status = 'in_progress' where id = p_submission_id;
  return jsonb_build_object('ok', true);
end;
$function$;
revoke all on function public.sq_start_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sq_start_job(uuid, uuid) to service_role;
