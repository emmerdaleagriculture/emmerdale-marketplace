# Emmerdale Marketplace

The contractor marketplace for **Emmerdale Agriculture Ltd** — the company behind
Hampshire Paddock Management (HPM). HPM receives more paddock/land jobs than it
can service; overflow jobs are posted, matched to contractors by county, and
awarded by competitive bid.

Built to the standalone master build spec (`docs/spec.md`).

## Stack

- **Next.js 15** (App Router, React 19) — deployed to Vercel
- **Supabase** — Postgres, Auth, Edge Functions, RLS (own project, not shared with HPM/Lumenira)
- **Resend** — transactional email
- **Stripe** — £20/mo subscription (Phase 4; schema + gating built in from day one)
- **postcodes.io** — postcode → county resolution (server-side, no key)
- **Styling:** plain global CSS variables + CSS Modules, design tokens copied
  verbatim from the HPM site so the two are visually indistinguishable. **No Tailwind**
  (HPM doesn't use it).

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Resend values
npm run dev                        # http://localhost:3000
```

Required env (see `.env.local.example`, spec §12.5): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS`.

## Project layout

```
src/
  app/
    (frontend)/        Public site — holding page, layout, globals.css
    api/test-email/    Phase 0 Resend verification route
  lib/
    env.ts             Boot-time env validation
    site.ts            Brand constants (company no., straplines)
    supabase/          Browser, server, service-role clients + middleware
  middleware.ts        Supabase session refresh
supabase/
  config.toml          CLI config (linked project: vonleampyheafgrkbbai)
  migrations/          Schema, RLS, views, RPCs, pg_cron  (Phase 0)
  seed.sql             counties, district_county_map, services  (Phase 0)
```

## Database workflow

The entire database must be reconstructable from the repo alone. Every schema
change is a numbered migration in `supabase/migrations/`; seeds live in
`supabase/seed.sql`; RLS policies are part of migrations, never dashboard clicks.

```bash
supabase db push          # apply migrations to the linked hosted project
supabase db reset         # locally: rebuild from migrations + seed (proves it)
```

## Build phases (spec §9)

- **Phase 0 — Ground:** domain, Supabase project, Resend DNS, schema + seeds + RLS, pg_cron, holding page. *(in progress)*
- **Phase 1 — Supply side:** landing, signup (county/service selection), auth, account, admin approval queue.
- **Phase 2 — Jobs + bidding:** admin intake + county resolution + consent gate, public_jobs view, job board, bidding, auto-award, contact reveal.
- **Phase 3 — Polish:** closing-soon nudges, admin metrics, relist/expired flows.
- **Phase 4 — Paid tier:** Stripe checkout/webhooks/portal, paid contact access, disclosure lines.

## Scripts

| Script               | Does                     |
| -------------------- | ------------------------ |
| `npm run dev`        | Dev server               |
| `npm run build`      | Production build         |
| `npm run start`      | Run the production build |
| `npm run lint`       | ESLint                   |
| `npm run type-check` | `tsc --noEmit`           |
