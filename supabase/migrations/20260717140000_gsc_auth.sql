-- ============================================================================
-- Google Search Console OAuth token storage for the admin SEO dashboard.
--
-- Single-row table (id is a boolean pinned to true) holding the refresh token
-- an admin grants via the /admin/seo/auth/connect flow. RLS is on with no
-- policies, so only the service role can read/write it — the token is a bearer
-- credential equivalent to the granting admin's Search Console access.
-- ============================================================================
create table if not exists gsc_auth (
  id               boolean primary key default true check (id),
  refresh_token    text,
  connected_email  text,
  connected_at     timestamptz
);

alter table gsc_auth enable row level security;

-- Seed the single row so the connect flow only ever UPDATEs it.
insert into gsc_auth (id) values (true) on conflict (id) do nothing;
