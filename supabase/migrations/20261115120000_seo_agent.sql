-- SEO agent: monthly Search Console triage → drafted opportunities for review.
--
-- Ported from HPM's agent (hpm-site 9b3d71f, PR #58), which keeps the same
-- records in a Payload collection. Here it is one table, written only by
-- /api/cron/seo-agent (src/lib/seoAgent/) and the admin review page
-- (/admin/seo/opportunities).
--
--   status      pending → approved → completed, or rejected. 'superseded' is
--               written by the agent itself: a query on cooldown (raised or
--               resolved within 120 days), or a variant clustered into
--               another row on the same page.
--   decided_at  set on every real decision (review, or the agent clustering a
--               variant into a lead that has a draft). The cooldown only
--               counts superseded rows that carry one, so a query the agent
--               keeps auto-superseding can't renew its own suppression.
--   related_note_id  the unpublished draft note a new_article opportunity
--               created (notes.published = false until Tom publishes it).
--
-- Service-role only, like gsc_auth: the agent and the admin page both use the
-- service-role client.

create table public.seo_opportunities (
  id               bigint generated always as identity primary key,
  query            text not null,
  type             text not null check (type in ('meta_rewrite', 'on_page_tweak', 'new_article')),
  intent           text check (intent in ('transactional', 'navigational', 'commercial', 'informational', 'local')),
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'completed', 'rejected', 'superseded')),
  week_identified  text not null,
  impressions      numeric,
  clicks           numeric,
  ctr              numeric,
  position         numeric,
  expected_ctr     numeric,
  rationale        text not null default '',
  target_url       text,
  draft_content    jsonb,
  related_queries  jsonb,
  competing_pages  jsonb,
  deferred         boolean not null default false,
  related_note_id  uuid references public.notes(id) on delete set null,
  review_notes     text,
  decided_at       timestamptz,
  agent_run_id     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (week_identified, query, type)
);
comment on table public.seo_opportunities is
  'Monthly SEO agent output (src/lib/seoAgent): one row per query worth acting on, with a Claude draft. Reviewed at /admin/seo/opportunities.';

create index seo_opportunities_query_idx on public.seo_opportunities (query);
create index seo_opportunities_status_idx on public.seo_opportunities (status);
create index seo_opportunities_decided_at_idx on public.seo_opportunities (decided_at);

create or replace function public.seo_opportunities_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger seo_opportunities_touch
  before update on public.seo_opportunities
  for each row execute function public.seo_opportunities_touch();

alter table public.seo_opportunities enable row level security;
revoke all on public.seo_opportunities from public, anon, authenticated;
revoke execute on function public.seo_opportunities_touch() from public, anon, authenticated;
