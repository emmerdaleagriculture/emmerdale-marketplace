-- Ask (2026-11-24): the figures for Admin › Dashboard. Counted here because a
-- plain select through the API stops at 1,000 rows.

create or replace function public.admin_ask_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'askers_30d', (select count(distinct contractor_id) from ask_questions where created_at > now() - interval '30 days'),
    'answered_30d', (select count(*) from ask_questions where status = 'answered' and created_at > now() - interval '30 days'),
    'failed_30d', (select count(*) from ask_questions where status = 'failed' and created_at > now() - interval '30 days'),
    'cost_usd_30d', (select coalesce(sum(cost_usd), 0) from ask_questions where created_at > now() - interval '30 days'),
    'answered_all', (select count(*) from ask_questions where status = 'answered'),
    'cost_usd_all', (select coalesce(sum(cost_usd), 0) from ask_questions),
    'packs_30d', (select count(*) from ask_token_lots where kind = 'pack' and created_at > now() - interval '30 days'),
    'packs_all', (select count(*) from ask_token_lots where kind = 'pack'),
    'free_left', (select coalesce(sum(remaining), 0) from ask_token_lots where kind = 'free' and expires_at > now()),
    'kept_left', (select coalesce(sum(remaining), 0) from ask_token_lots where kind <> 'free')
  );
$$;

revoke execute on function public.admin_ask_summary() from public, anon, authenticated;
grant execute on function public.admin_ask_summary() to service_role;
