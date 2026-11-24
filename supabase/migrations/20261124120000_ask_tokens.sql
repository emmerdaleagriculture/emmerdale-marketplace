-- Ask (2026-11-24): tokens for asking questions of your books and business.
--
-- A Premium member gets a free allowance once a year and can buy packs to top
-- up. One question costs one token; a question that fails gives it back.
--
-- ask_token_lots   one row per grant: the yearly free allowance (expires a
--                  year on), a bought pack or an admin gift (neither expires).
-- ask_questions    one row per question asked, with the lot it was paid from
--                  and what the answer cost us.
--
-- Tokens are taken from the lot that expires soonest, so the free allowance
-- goes before anything paid for. Every change to a contractor's lots happens
-- under one advisory lock, so a burst of questions can't overspend and two
-- page loads can't grant the year's allowance twice.
--
-- Whether someone may ask at all (Premium, approved, released) is the app's
-- rule (src/lib/books/askTokens.server.ts); these functions only keep count.
-- Service role only.

create table if not exists public.ask_token_lots (
  id bigint generated always as identity primary key,
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  kind text not null check (kind in ('free', 'pack', 'gift')),
  tokens int not null check (tokens > 0),
  remaining int not null check (remaining >= 0),
  expires_at timestamptz,
  -- The Stripe Checkout session a pack was bought in: one lot per payment.
  stripe_session_id text unique,
  note text,
  created_at timestamptz not null default now(),
  check (remaining <= tokens)
);
create index if not exists ask_token_lots_contractor_idx on public.ask_token_lots (contractor_id, created_at);

create table if not exists public.ask_questions (
  id bigint generated always as identity primary key,
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  lot_id bigint references public.ask_token_lots (id) on delete set null,
  question text not null,
  answer text,
  status text not null default 'running' check (status in ('running', 'answered', 'failed')),
  refunded boolean not null default false,
  model text,
  tools jsonb,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 5),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ask_questions_contractor_idx on public.ask_questions (contractor_id, created_at desc);

alter table public.ask_token_lots enable row level security;
alter table public.ask_questions enable row level security;
revoke all on public.ask_token_lots from public, anon, authenticated;
revoke all on public.ask_questions from public, anon, authenticated;
grant all on public.ask_token_lots to service_role;
grant all on public.ask_questions to service_role;

-- The yearly free allowance: granted if there has been none in the last 12
-- months. True when a new lot was made.
create or replace function public.ask_tokens_grant_free(p_contractor_id uuid, p_tokens int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('ask_tokens:' || p_contractor_id::text));
  if exists (
    select 1 from ask_token_lots
    where contractor_id = p_contractor_id and kind = 'free' and created_at > now() - interval '1 year'
  ) then
    return false;
  end if;
  insert into ask_token_lots (contractor_id, kind, tokens, remaining, expires_at)
  values (p_contractor_id, 'free', p_tokens, p_tokens, now() + interval '1 year');
  return true;
end;
$$;

-- Take one token and open the question. Returns the question id, or null when
-- there is nothing left to spend.
create or replace function public.ask_tokens_take(p_contractor_id uuid, p_question text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot bigint;
  v_question bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ask_tokens:' || p_contractor_id::text));
  select id into v_lot
  from ask_token_lots
  where contractor_id = p_contractor_id
    and remaining > 0
    and (expires_at is null or expires_at > now())
  order by expires_at asc nulls last, id asc
  limit 1;
  if not found then
    return null;
  end if;
  update ask_token_lots set remaining = remaining - 1 where id = v_lot;
  insert into ask_questions (contractor_id, lot_id, question)
  values (p_contractor_id, v_lot, p_question)
  returning id into v_question;
  return v_question;
end;
$$;

-- A question that didn't get an answer: mark it failed and give the token
-- back, once. True when a token was returned.
create or replace function public.ask_tokens_refund(p_question_id bigint, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor uuid;
  v_lot bigint;
begin
  select contractor_id into v_contractor from ask_questions where id = p_question_id;
  if not found then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('ask_tokens:' || v_contractor::text));
  update ask_questions
  set status = 'failed', refunded = true, error = coalesce(p_error, error), finished_at = now()
  where id = p_question_id and status = 'running' and not refunded
  returning lot_id into v_lot;
  if not found then
    return false;
  end if;
  update ask_token_lots set remaining = least(tokens, remaining + 1) where id = v_lot;
  return true;
end;
$$;

-- `revoke … from public` alone leaves anon/authenticated able to call these
-- through the API here, so name them.
revoke execute on function public.ask_tokens_grant_free(uuid, int) from public, anon, authenticated;
revoke execute on function public.ask_tokens_take(uuid, text) from public, anon, authenticated;
revoke execute on function public.ask_tokens_refund(bigint, text) from public, anon, authenticated;
grant execute on function public.ask_tokens_grant_free(uuid, int) to service_role;
grant execute on function public.ask_tokens_take(uuid, text) to service_role;
grant execute on function public.ask_tokens_refund(bigint, text) to service_role;

-- Released to HPM first. Missing or unreadable = nobody.
insert into public.app_config (key, value)
values ('ask_allowlist', '["tom@hampshirepaddockmanagement.com"]'::jsonb)
on conflict (key) do nothing;
