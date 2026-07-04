# Emmerdale Marketplace

A marketplace for the Emmerdale Agriculture community. Built with **Next.js 15**
(App Router) and **Payload CMS 3** on **Postgres** — the same stack as the
[hpm](https://github.com/Emmerdale-agriculture/hpm) site.

## Stack

- **Next.js 15** — App Router, React 19
- **Payload CMS 3** — admin, auth, and content API, mounted in-app
- **Postgres** — via `@payloadcms/db-postgres`
- **TypeScript**, ESLint (`next/core-web-vitals`)
- Media uploads stored **locally** in dev (`/media`); swap in
  `@payloadcms/storage-s3` for production object storage.

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in:
   - `PAYLOAD_SECRET` — `openssl rand -base64 48`
   - `DATABASE_URL` — a running Postgres database

3. **Run the dev server**

   ```bash
   npm run dev
   ```

   - Frontend: <http://localhost:3000>
   - Admin: <http://localhost:3000/admin> (create the first user on first visit)

## Project layout

```
src/
  app/
    (frontend)/        Public site — landing page, layout, global CSS
    (payload)/         Payload admin (/admin) + REST/GraphQL API (/api)
  lib/
    env.ts             Boot-time env-var validation
  payload/
    payload.config.ts  Payload config (collections, db, auth)
    collections/       Users, Media, Listings
```

## Data model

| Collection | Purpose                                             |
| ---------- | --------------------------------------------------- |
| `users`    | Admin/seller accounts (Payload auth)                |
| `media`    | Image uploads with required alt text                |
| `listings` | Core marketplace object — title, price, status, ... |

## Scripts

| Script                   | Does                                       |
| ------------------------ | ------------------------------------------ |
| `npm run dev`            | Start the dev server                       |
| `npm run build`          | Generate Payload types, then `next build`  |
| `npm run start`          | Run the production build                   |
| `npm run lint`           | ESLint                                     |
| `npm run type-check`     | `tsc --noEmit`                             |
| `npm run payload`        | Payload CLI                                |

## Next steps

- Add a `/listings` browse grid and `/listings/[slug]` detail page.
- Wire up production media storage (`@payloadcms/storage-s3`).
- Add categories, search, and seller onboarding.
