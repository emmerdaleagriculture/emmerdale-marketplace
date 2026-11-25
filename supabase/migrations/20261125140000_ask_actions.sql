-- Ask (2026-11-25): follow-up questions and changes to the books.
--
-- ask_questions.thread_id   a follow-up points at the first question of its
--                           conversation (null on that first question), so an
--                           earlier answer can be asked about further.
-- ask_actions               a change Ask has prepared for the books (record an
--                           expense, draft an invoice…). Nothing is written to
--                           the books until the member confirms it: 'pending'
--                           → 'running' (claimed, so two taps can't post
--                           twice) → 'done'; or 'cancelled'. `input` is the
--                           checked request, `summary` what the member is
--                           shown, `result` where to find what was made.
--
-- Service role only, like the rest of Ask.

alter table public.ask_questions
  add column if not exists thread_id bigint references public.ask_questions (id) on delete set null;
create index if not exists ask_questions_thread_idx on public.ask_questions (thread_id) where thread_id is not null;

create table if not exists public.ask_actions (
  id bigint generated always as identity primary key,
  question_id bigint not null references public.ask_questions (id) on delete cascade,
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  kind text not null,
  input jsonb not null,
  summary jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'cancelled')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ask_actions_question_idx on public.ask_actions (question_id);
create index if not exists ask_actions_contractor_idx on public.ask_actions (contractor_id, created_at desc);

alter table public.ask_actions enable row level security;
revoke all on public.ask_actions from public, anon, authenticated;
grant all on public.ask_actions to service_role;
