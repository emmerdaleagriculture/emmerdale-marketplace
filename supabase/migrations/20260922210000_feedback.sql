-- ════════════════════════════════════════════════════════════════════════
-- Feedback from anyone using the site.
--
-- One box, and whatever we already know: who they are if signed in, which
-- side they are on, and the page they were looking at. Asking a contractor
-- to tell us they are a contractor, on a page we put in front of them, is
-- how you get no feedback.
--
-- `path` is stored through redactPath(): /my/<48-hex> and /quote/<48-hex>
-- carry a working key to a customer's job or a contractor's quote page, and
-- a feedback table is not a place to keep one.
--
-- Sealed like client_quotes: RLS on, no policies, so only the service role
-- reads it. Nothing here is the submitter's to read back, and some of it is
-- other people's — a message can quote anything on screen.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  message     text not null check (length(btrim(message)) > 0),
  -- From the session when signed in, typed when not, absent when they would
  -- rather not say. Never required: a reply is a bonus, the point is the
  -- message.
  email       text,
  user_id     uuid,
  -- contractor | customer | both | account | visitor. Resolved on the server
  -- from the session, not sent by the page.
  role        text not null default 'visitor',
  path        text,
  user_agent  text,
  handled_at  timestamptz,
  handled_by  uuid
);

create index if not exists feedback_open_idx on feedback (created_at desc) where handled_at is null;

alter table feedback enable row level security;
-- No policies on purpose. Service role only.
