-- ============================================================================
-- Notes (blog) — the marketplace's port of the HPM "Notes from the field"
-- blog. Supabase-backed instead of Payload: one table, markdown content,
-- hero images in a public storage bucket. Published rows are world-readable
-- (the pages are indexed, ISR-cached, and fetched with the anon key); all
-- writes go through the admin editor with the service role.
-- ============================================================================

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  -- Markdown body, rendered server-side at page build time.
  content_md text not null default '',
  -- Curated tag slugs (src/lib/notes/tags.ts is the taxonomy source of truth).
  primary_tag text,
  tags text[] not null default '{}',
  -- Storage path inside the notes-media bucket (public URL derived in app).
  hero_path text,
  hero_alt text,
  featured boolean not null default false,
  published boolean not null default false,
  -- Set on first publish; ordering + display date.
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_published_idx
  on public.notes (published, published_at desc);

alter table public.notes enable row level security;

-- Published posts are public content — readable with the anon key so the
-- static/ISR pages can fetch without cookies. Drafts stay service-role only.
drop policy if exists notes_public_read on public.notes;
create policy notes_public_read on public.notes
  for select to anon, authenticated
  using (published = true);

-- Public bucket for hero + inline images. Public buckets serve objects via
-- /object/public/ without storage policies; uploads happen with the service
-- role from the admin editor.
insert into storage.buckets (id, name, public)
values ('notes-media', 'notes-media', true)
on conflict (id) do nothing;
