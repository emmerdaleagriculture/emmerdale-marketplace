-- Info › Name that weed: one row per photo a member sends to be identified.
-- It is the daily allowance (counted per user), the record of what the AI
-- cost, and the evidence for whether its answers are any good. The photo
-- itself is not kept.
create table if not exists public.weed_id_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The weed it settled on (a slug from src/lib/info/weeds.ts), or null when
  -- it is something not on our list or not a plant at all.
  weed_slug text,
  answer_name text,
  confidence numeric(3, 2),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(8, 5) not null default 0,
  error text
);

comment on table public.weed_id_events is
  'Info > Name that weed: photo identifications asked for by Pro and Premium members. Service-role only.';

create index if not exists weed_id_events_user_idx on public.weed_id_events (user_id, created_at desc);

alter table public.weed_id_events enable row level security;
revoke all on public.weed_id_events from public, anon, authenticated;
grant all on public.weed_id_events to service_role;
