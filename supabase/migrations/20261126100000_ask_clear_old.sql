-- Ask: answers are kept for 30 days.
--
-- A conversation (a question and its follow-ups) whose latest question is
-- over 30 days old has its text removed: the question, the answer, the tool
-- trace and any changes it set up. The row stays, emptied, because it is
-- also the record of the token spent and what the answer cost; the page
-- never shows it again. Runs nightly.

alter table public.ask_questions add column if not exists cleared_at timestamptz;

create or replace function public.sq_ask_clear_old()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  with conv as (
    select coalesce(thread_id, id) as root, max(created_at) as latest
    from ask_questions
    group by 1
  ),
  old as (
    select q.id
    from ask_questions q
    join conv c on c.root = coalesce(q.thread_id, q.id)
    where c.latest < now() - interval '30 days'
      and q.cleared_at is null
      and q.status <> 'running'
  ),
  gone as (
    delete from ask_actions a using old where a.question_id = old.id
  )
  update ask_questions q
  set question = '', answer = null, tools = null, error = null, cleared_at = now()
  from old
  where q.id = old.id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.sq_ask_clear_old() from public, anon, authenticated;
grant execute on function public.sq_ask_clear_old() to service_role;

-- 03:50 UTC every night.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ask-clear-old') then
    perform cron.unschedule('ask-clear-old');
  end if;
  perform cron.schedule('ask-clear-old', '50 3 * * *', $c$select public.sq_ask_clear_old();$c$);
end $$;
