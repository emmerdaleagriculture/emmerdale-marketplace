# Emmerdale Agriculture — Contractor Marketplace · Master Build Spec (Standalone)

**Supersedes** the `/network` module spec of June 2026. Three structural changes: (1) standalone site at **emmerdaleagriculture.com**, not a module inside hampshirepaddockmanagement.com; (2) coverage is **county-based**, not postcode-radius; (3) allocation is **competitive bidding with a 24-hour close**, not first-claim. Carried forward unchanged: the GDPR consent gate at intake, the Resend notification pattern, the 15-service taxonomy. **Branding: exact match to the current HPM site** — design tokens lifted directly from the HPM repo, not approximated (Section 7.0).

**What it is.** Hampshire Paddock Management receives more paddock/land job enquiries than it can service. Overflow jobs are posted by admin with a postcode; the postcode resolves to a county; contractors who have selected that county are notified and can bid. At the 24-hour close, the winning contractor receives the customer's contact details. Paid members (£20/month) get a 12-hour exclusive head start on every job — full details including contact, no bidding — before the job opens to the free tier. Emmerdale Agriculture handles no customer payments — the contractor invoices the customer directly.

---

## 1. Stack & deployment

- **New Next.js (App Router) app**, deployed to Vercel, domain `emmerdaleagriculture.com`.
- **New Supabase project** (own auth, own Postgres, own Edge Functions). Do not share the HPM/Lumenira projects — this site has its own user base and lifecycle.
- **Resend** for transactional email. Verify DNS on `emmerdaleagriculture.com` first — nothing sends until this is done, so it is step zero.
- **Stripe** for the £20/month subscription (Stripe Checkout + customer portal + webhooks). Not needed for launch — schema and gating built in from day one, Stripe wiring is Phase 4.
- **postcodes.io** (free, no key) for postcode → county resolution at job-creation time. Server-side only.
- Tailwind, with the design system copied from the HPM repo (Section 7.0) — the marketplace should be visually indistinguishable from hampshirepaddockmanagement.com apart from its own name and content.

---

## 2. County model

Contractors select the counties they operate in from a canonical list; jobs resolve to exactly one county from their postcode; matching is `job.county_id IN (contractor's selected counties)`.

### 2.1 Canonical county list

A `counties` reference table seeded with the **ceremonial counties of England (48)** plus the **preserved counties of Wales (8)** and, if Scottish coverage is wanted at launch, the **lieutenancy areas of Scotland (35)**. Recommendation: seed England + Wales at launch, add Scotland when a Scottish contractor actually signs up (the mapping table in 2.2 grows accordingly).

```sql
create table counties (
  id serial primary key,
  name text not null unique,        -- 'Hampshire', 'Wiltshire', ...
  region text not null,             -- 'South East', 'South West', ... (for grouped UI)
  country text not null default 'England'
);
```

The signup/account UI groups counties by `region` with a select-all-per-region control, so a contractor covering the whole South West is two clicks, not seven.

### 2.2 Postcode → county resolution

postcodes.io returns `admin_county` for two-tier authorities but **null for unitary authorities** (e.g. SO23 Winchester returns Hampshire, but BH postcodes in Bournemouth return null county with `admin_district` = 'Bournemouth, Christchurch and Poole'). Resolution order, implemented in one server function `resolveCounty(postcode)`:

1. `GET https://api.postcodes.io/postcodes/{postcode}` → if `admin_county` is non-null and matches a `counties.name`, use it.
2. Else look up `admin_district` in a static `district_county_map` table (seeded, ~120 rows covering every English/Welsh unitary authority → ceremonial county). E.g. 'Bournemouth, Christchurch and Poole' → Dorset; 'Southampton' → Hampshire; 'Swindon' → Wiltshire.
3. Else fail loudly in the admin UI: "Could not resolve county for this postcode — pick manually," with a county dropdown. The manual pick is stored the same way; nothing downstream cares how the county was resolved.

```sql
create table district_county_map (
  admin_district text primary key,
  county_id int not null references counties(id)
);
```

The resolved county is stored on the job at creation. It is never recomputed — if postcodes.io changes an answer later, existing jobs are unaffected.

---

## 3. Data model

```sql
-- Contractors (one row per auth user; profile completed at signup)
create table contractors (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  contact_name text not null,
  phone text not null,
  email text not null,              -- denormalised from auth for admin convenience
  base_postcode text not null,      -- display/vetting only, NOT used for matching
  services int[] not null default '{}',   -- FK values into services table
  status text not null default 'pending'  -- pending | approved | suspended
    check (status in ('pending','approved','suspended')),
  notify_new_jobs boolean not null default true,
  created_at timestamptz not null default now()
);

create table contractor_counties (
  contractor_id uuid references contractors(id) on delete cascade,
  county_id int references counties(id),
  primary key (contractor_id, county_id)
);

create table services (
  id serial primary key,
  name text not null unique
);
-- Seed with the confirmed 15: Paddock topping, Flailing, Flail collecting,
-- Finish mowing, Harrowing, Rolling, Rotavating, Mole ploughing, Stone burying,
-- Land & ditch clearance, Weed control, Spraying, Fertiliser application,
-- Overseeding, Manure sweeping.

-- Jobs (admin-created only at launch)
create table jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  service_ids int[] not null default '{}',
  postcode text not null,                 -- full postcode, PRIVATE
  postcode_district text not null,        -- e.g. 'SO23', PUBLIC (shown pre-award)
  town text,                               -- from postcodes.io, PUBLIC
  county_id int not null references counties(id),
  customer_name text not null,             -- PRIVATE until reveal
  customer_phone text not null,             -- PRIVATE until reveal
  customer_email text,                      -- PRIVATE until reveal
  consent_to_share boolean not null default false,
  consent_at timestamptz,
  consent_wording_version text,
  budget_hint text,                         -- optional, free text, PUBLIC
  status text not null default 'exclusive'
    check (status in ('exclusive','open','awarded','expired','withdrawn','completed')),
  bidding_opens_at timestamptz not null,    -- created_at + 12h (paid head start);
                                            -- = created_at until Phase 4 ships
  bidding_closes_at timestamptz not null,   -- bidding_opens_at + 24h, admin-adjustable
  awarded_bid_id uuid,                       -- set on award
  created_by uuid not null,                  -- admin user
  created_at timestamptz not null default now()
);

create table bids (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  contractor_id uuid not null references contractors(id),
  amount_pence int not null check (amount_pence > 0),
  note text,                                 -- optional pitch, max 500 chars
  created_at timestamptz not null default now(),
  unique (job_id, contractor_id)             -- one live bid; re-bid = UPDATE
);

-- Every disclosure of customer contact details, whatever the route
create table contact_reveals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  contractor_id uuid not null references contractors(id),
  route text not null check (route in ('bid_won','paid_access','admin_manual')),
  revealed_at timestamptz not null default now(),
  unique (job_id, contractor_id)
);

-- Subscriptions (Phase 4, but table exists from day one so gating logic is stable)
create table subscriptions (
  contractor_id uuid primary key references contractors(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'none'
    check (status in ('none','active','past_due','canceled')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- Notification idempotency (carried over from the alerts subsystem)
create table job_notifications (
  job_id uuid references jobs(id) on delete cascade,
  contractor_id uuid references contractors(id) on delete cascade,
  kind text not null,      -- 'new_job' | 'won' | 'lost' | 'closing_soon'
  sent_at timestamptz not null default now(),
  primary key (job_id, contractor_id, kind)
);
```

**Privacy split, enforced in the database, not the UI.** Two views:

- `public_jobs` — open jobs with `postcode_district`, `town`, `county`, title, description, services, budget_hint, `bidding_closes_at`, bid count. **No** full postcode, **no** customer fields. Only rows where `consent_to_share = true`. This is what free contractors see.
- Full customer details are returned only by two `security definer` RPCs: `get_job_contact(job_id)` — succeeds if the caller has a `contact_reveals` row for that job, or is an active subscriber (in which case it *inserts* the reveal row with route `paid_access`, then returns) — and admin access via service role. There is no path to customer PII through RLS on the base table; `jobs` is not selectable by contractors at all.

RLS throughout: contractors read/update only their own `contractors`, `contractor_counties`, `bids` rows; `public_jobs` view readable by any `approved` contractor; everything else service-role only.

---

## 4. Bidding lifecycle

```
Admin posts job (postcode → county resolved, consent flag verified)
        │  status = 'exclusive', bidding_opens_at = now()+12h
        ▼ (DB webhook on INSERT)
Edge Fn notify-new-job ──► Resend ──► PAID members matching county only:
                                      "New job — exclusive access for 12h"
        │
   ── 12-HOUR PAID WINDOW ──
   Paid members see full details incl. contact (reveal logged, route
   'paid_access'). If one books the job, they hit "I've booked this" →
   admin notified, admin withdraws (status 'withdrawn', free tier never sees it).
        │
        ▼ at bidding_opens_at (pg_cron: open_due_jobs())
status → 'open'; email to matching FREE-TIER contractors (notify_new_jobs = true)
        │
Contractors bid (amount + note); may revise until close; bid count public,
amounts private (each contractor sees only their own bid). Paid members
retain contact access throughout — but a job that survived the exclusive
window is, by definition, one no paid member wanted.
        │
        ▼ at bidding_closes_at = bidding_opens_at + 24h (close_due_jobs())
AUTO-AWARD: lowest amount_pence wins; tie → earliest created_at.
  - jobs.status = 'awarded', awarded_bid_id set
  - contact_reveals row inserted (route 'bid_won')
  - Emails: winner (contact details + their quoted price + disclosure line if
    any paid reveals occurred), losers (courteous, no winning amount)
No bids at close → status 'expired', admin notified, can relist (new window).
```

**Total lifecycle: 36 hours** (12 exclusive + 24 bidding). If that feels long for urgent jobs, the admin form lets you shorten or zero the exclusive window per job — `bidding_opens_at` is just a timestamp. **Until Phase 4 ships, the admin form defaults `bidding_opens_at = now()`** so jobs open to bidding immediately; the 12h default switches on with the paid tier.

**Admin overrides, all available before close:** award any bid manually (not just lowest — quality matters); extend `bidding_closes_at`; withdraw the job. Manual award short-circuits the cron path (status check makes `close_due_jobs()` skip non-open jobs).

**Sealed bids.** Contractors see the number of bids on a job but not amounts. This prevents a race to the bottom in public and keeps the mechanic simple. Each contractor can revise their own bid until close (UPSERT on the unique constraint).

**Closing-soon nudge (optional, Phase 3):** at T-4h, email matched contractors who haven't bid, respecting the same idempotency table.

**Scheduling:** `pg_cron` extension in Supabase, one schedule every 5 minutes running `select open_due_jobs(); select close_due_jobs();`. `open_due_jobs()` flips `exclusive → open` where `bidding_opens_at <= now()` and queues the free-tier notification emails; `close_due_jobs()` closes and awards atomically. Both insert into a `pending_emails` queue table; a scheduled Edge Function drains the queue via Resend. This keeps state transitions free of network calls.

---

## 5. Paid tier (£20/month)

**The product:** active subscribers get a **12-hour exclusive window** on every new job in their counties — full details including customer contact, immediately on posting, no bidding, before free-tier contractors even know the job exists. After the window, the job opens to bidding but paid members retain contact access throughout.

This is the value proposition in one line for the landing page: *"See every job 12 hours before anyone else — and skip the bidding entirely."*

**Booking flow during the window:** a paid member who takes the job hits **"I've booked this"** on the job page. That does not close the job automatically (a paid member should not be able to unilaterally kill listings) — it notifies admin, who confirms with a one-click withdraw. Withdrawn-in-window jobs never reach the free tier. If admin doesn't act, the job opens to bidding as scheduled and the disclosure line (below) covers the risk.

**Residual collision handling:** a job that survives the exclusive window can, in principle, still be contacted by a paid member during bidding. So:

1. Every paid reveal is logged in `contact_reveals`, and the award email to a bid winner includes, when applicable: *"Note: N paid members have also had access to this enquiry."* Honesty is cheaper than complaints — but under the head-start model this line should be rare, because a job reaching bidding is one paid members passed on.
2. Admin dashboard shows reveal counts and booked-flag rates per job, so window length (12h is a default, not a law of nature) can be tuned against real fill data.

**Gating:** a single helper `isActiveSubscriber(contractor_id)` (status = 'active' OR (status = 'canceled' AND current_period_end > now())). Used by `get_job_contact` and by the UI to swap the bid panel for a contact panel.

**Stripe wiring (Phase 4):** one Price at £20/month, Stripe Checkout session from the account page, webhooks for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` updating `subscriptions`. Customer portal link for self-service cancellation. No proration complexity — one plan, monthly.

---

## 6. Compliance gate (carried over, wording updated)

Customer PII is disclosed to a separate controller. Because the paid tier makes multi-contractor disclosure possible, the intake consent wording changes from the single-winner version:

> *"If we can't carry out this work ourselves, we'll pass your enquiry — including your name and contact details — to one or more vetted contractors in our network so they can contact you directly about the job."*

Store `consent_to_share`, `consent_at`, `consent_wording_version` (start at `v2-multi`). Phone/email enquiries entered by admin: same rule, verbal consent logged with date. **No consent → the job cannot be posted to the marketplace at all** — the admin form's submit is disabled without the consent confirmation, and the `public_jobs` view and both RPCs require `consent_to_share = true` regardless.

Privacy page on emmerdaleagriculture.com names the disclosure, names the categories of recipient (vetted agricultural contractors), and states retention. Contractors, at signup, tick acceptance of terms that include an obligation to use customer details solely for responding to the specific enquiry (this is your controller-to-controller hygiene).

Contractor PII: business details are visible to admin only until award; the winner's business name and phone are included in nothing customer-facing at launch (the contractor makes contact, not the reverse) — so no contractor data leaves the platform except by the contractor's own action.

---

## 7. Pages & routes

### 7.0 Brand & design system — match HPM exactly

The marketplace must look like a sibling of the current HPM site (the Next.js rebuild deployed at hpm-site-eta.vercel.app / hampshirepaddockmanagement.com), not a cousin. Because the HPM site is our own codebase, **the source of truth for all visual tokens is the HPM repo itself** — Claude Code has access to it and must copy, not recreate:

- `tailwind.config.*` — the full theme extension: brand colour palette (the greens and any accent/neutral scales), spacing, radii, shadows. This finally retires the `#1f4d2e` placeholder carried from the previous spec: use whatever the HPM config actually defines.
- Font setup — whatever `next/font` (or equivalent) configuration HPM uses, including the italic display treatment used in headings.
- `globals.css` — any CSS variables, base styles, selection colours.
- Reusable primitives where they exist as components (buttons, section headers with the small-caps kicker label pattern, cards, the footer) — copy the components into this repo rather than importing across repos; the projects stay independently deployable.

**Voice and copy patterns**, observed from the live site and to be reproduced:

- Headings use *italic emphasis on the final word or phrase*: "Paddock care, done *properly.*", "We manage the land, *you manage the horses.*" Marketplace equivalents in that register: "Good jobs, passed to contractors who can *actually do them.*", "See every job *twelve hours early.*"
- Small-caps kicker labels above headings ("About us", "Services", "The fleet") — reuse for "The network", "How it works", "For contractors".
- Plain, confident, concrete sentences. Numbers as proof points (HPM uses "4 John Deeres · 16+ implements · £2m+ public liability"); the marketplace's equivalents once real: contractors registered, counties covered, jobs filled.
- Footer pattern verbatim in structure: brand line + strapline ("Paddocks, put right." → marketplace strapline in the same register, e.g. "Work, passed on *properly.*"), grouped link columns, then "© 2026 Emmerdale Agriculture Ltd · Company No. 14950816", privacy link, "Made with care in Hampshire".
- The relationship line flips: HPM's footer says "Trading as Emmerdale Agriculture Ltd"; the marketplace is the parent brand, so its credibility block says the network is run by Emmerdale Agriculture Ltd, the company behind Hampshire Paddock Management — with a link back to hampshirepaddockmanagement.com.

**Imagery:** the HPM Supabase storage bucket (`hpm-media`) holds the fleet/field photography. Reuse selected images on the marketplace landing page (the John Deere hero shots establish agricultural credibility instantly) — either by referencing the existing public bucket URLs or copying chosen files into the marketplace project's own bucket. Copying is preferred: no cross-project coupling, and images survive any HPM storage reorganisation.

### 7.1 Routes

**Public**
- `/` — Landing. Hero: the proposition in one sentence ("Paddock and land jobs across the country, passed to contractors who can *actually do them*"), how-it-works in three steps (sign up → get matched by county → bid and win the work), the 15 services as a scannable strip, credibility block (Emmerdale Agriculture Ltd, Co. 14950816, trading as Hampshire Paddock Management — the network exists because HPM turns work away), primary CTA "Join the network — free", secondary teaser for the £20/month tier ("or get direct access to every job — no bidding").
- `/signup` — email/password via Supabase Auth, then profile: business name, contact name, phone, base postcode, services (multi-select), counties (region-grouped multi-select). Terms + privacy acceptance. Lands in `status = 'pending'`.
- `/login`, `/reset-password` — standard.
- `/privacy`, `/terms` — required before launch (Section 6).

**Contractor (auth, approved only — pending users see a "we're reviewing your application" holding screen)**
- `/jobs` — open jobs in the contractor's counties. Card: title, town + postcode district, county, services, budget hint, closes-in countdown, bid count, "your bid: £X" if bid. Paid members see the same list with a "Contact details available" affordance per card.
- `/jobs/[id]` — full public detail; bid panel (amount, note, submit/revise) for free tier; contact panel (name, phone, email + reveal logging) for paid. After close: outcome state (won with contact details / lost / expired).
- `/account` — profile editing, county coverage editing (effective immediately for future notifications), notification toggle, subscription status + upgrade/manage buttons (Phase 4).

**Admin (role-gated via an `is_admin` claim; you are the only admin at launch)**
- `/admin/jobs` — list with status, bid counts, reveal counts, close timers.
- `/admin/jobs/new` — the intake form: customer details, job details, postcode (county auto-resolves with manual fallback per 2.2), consent confirmation (blocking), close time (default now+24h).
- `/admin/jobs/[id]` — bids table (all amounts visible to admin), manual award, extend, withdraw, relist.
- `/admin/contractors` — approval queue (pending → approved/suspended), contractor detail with counties/services/bid history.

---

## 8. Notifications (Resend, all idempotent via job_notifications)

| Trigger | Recipient | Content |
|---|---|---|
| Job posted | **Paid** members matching county | "Exclusive for 12h" framing, title, town + district, county, services, budget hint, link. (Contact details on the site behind the reveal RPC, not in the email.) |
| Bidding opens | **Free-tier** approved contractors matching county, notify on | Title, town + district, county, services, budget hint, closes-at, link. **Never the full postcode or any customer detail.** |
| Booked-in-window flag | Admin | Paid member X marked job Y booked — confirm withdraw. |
| Bid won | Winner | Congrats, their quoted price, customer name/phone/email, the "N paid members also had access" line when applicable, reminder that details are for this enquiry only. |
| Bid lost | Losing bidders | Courteous, short, no winning amount, link back to open jobs. |
| Job expired (no bids) | Admin | Prompt to relist or handle internally. |
| Closing soon (Phase 3) | Matched non-bidders | T-4h nudge. |
| Application approved | Contractor | Welcome, link to `/jobs`. |

One-click unsubscribe honoured immediately (`notify_new_jobs = false`); transactional emails about the contractor's own bids are exempt from the toggle.

---

## 9. Build order

**Phase 0 — Ground.** Full runbook in Section 12. Domain on Vercel, Supabase project, Resend DNS verification (blocks everything downstream — do first), schema + seeds (counties, district_county_map, services), RLS.

**Phase 1 — Supply side.** Landing page, signup with county/service selection, auth, account management, admin contractor approval queue. *Shippable: you can start recruiting contractors before a single job exists — and you should, since a marketplace with jobs and no contractors is worse than the reverse.*

**Phase 2 — Jobs + bidding.** Admin job intake with county resolution and consent gate, public_jobs view, job board and detail pages, bid submit/revise, `close_due_jobs()` + pg_cron, award emails, contact reveal RPC. *Shippable: the full free-tier marketplace.*

**Phase 3 — Polish.** Closing-soon nudges, admin dashboard metrics (fill rate, median bids per job, time-to-first-bid), relist flow, expired handling.

**Phase 4 — Paid tier.** Stripe products/checkout/webhooks/portal, `paid_access` reveal route, UI swap on job cards/detail, the "N paid members" disclosure line in award emails.

---

## 10. Acceptance criteria

1. A job posted with postcode SO23 9XX resolves to Hampshire and notifies only approved contractors with Hampshire selected; a contractor covering only Wiltshire receives nothing and cannot see the job.
2. A job posted with a Bournemouth (unitary) postcode resolves to Dorset via the mapping table.
3. No query path available to a contractor role returns full postcode or customer fields for a job they have no `contact_reveals` row for and no active subscription.
4. Two bids of equal amount: the earlier bid wins at auto-close.
5. Admin manually awards a non-lowest bid at T-2h; the cron close skips the job; only the awarded contractor receives contact details.
6. A job with `consent_to_share = false` cannot be created via the admin form and, if forced into the table, never appears in `public_jobs` and both RPCs refuse it.
7. Webhook retry on job INSERT does not double-send new-job emails (job_notifications PK).
8. A subscriber whose subscription is `canceled` with `current_period_end` in the future retains access until that timestamp, then loses it without code changes.
9. A contractor revising their bid does not create a second bids row.
10. Deleting a contractor cascades their bids and county selections but leaves `contact_reveals` history intact for audit (FK without cascade on contact_reveals.contractor_id — adjust: use `on delete restrict` and soft-suspend instead of delete).
11. A job in `exclusive` status is invisible to free-tier contractors (not in `public_jobs`, bid RPC refuses it) and fully visible with contact access to an active subscriber in a matching county.
12. `open_due_jobs()` flips an exclusive job to open at `bidding_opens_at` and free-tier notification emails go out exactly once (idempotency PK), even across cron overlaps.
13. A job withdrawn by admin during the exclusive window generates no free-tier notification and never appears on the free-tier board.
14. "I've booked this" notifies admin but does not change job status by itself.
15. Pre-Phase-4, admin-created jobs default to `bidding_opens_at = now()` and skip the exclusive state entirely.

---

## 11. Open items (decide before or during Phase 2)

- **Award rule confirmation:** auto-lowest-with-admin-override is specced. Alternatives: admin always picks (slower, higher quality control) or first-bid-wins (fastest, no price competition).
- **Scotland at launch?** Default: England + Wales counties seeded; Scotland deferred.
- ~~Brand green hex~~ — **resolved by method**: Claude Code copies the actual token values from the HPM repo's Tailwind config (Section 7.0). No placeholder survives into the build.
- **Vetting depth at approval:** launch default is a manual eyeball of business name + base postcode. Insurance/RAMS document upload is a schema-compatible later addition (`contractor_documents` table) — recommended before the paid tier launches, since paid members touching customers directly with zero vetting is your reputational exposure.
- ~~Paid-tier exclusivity window~~ — **decided: 12-hour head start** (Section 5). Remaining tunable: window length, revisit against fill data after four weeks of paid-tier operation.

---

## 12. Phase 0 runbook — environment setup

There is no self-hosted web server anywhere in this build. Everything runs on managed services; the owner already operates Vercel + Supabase for another product, so these are new projects in existing accounts, not new accounts. Total setup is ~30 minutes of console work plus DNS propagation. **Human (Tom) does 12.1–12.4 once; Claude Code consumes the outputs via 12.5 and owns everything after.**

### 12.1 Domain

`emmerdaleagriculture.com` — confirm ownership or register (~£10/yr). All DNS records below are set at whichever registrar/DNS host controls the domain. Nothing else is a hard prerequisite.

### 12.2 Vercel

1. New project in the existing Vercel account, connected to the GitHub repo Claude Code creates (repo name suggestion: `emmerdale-marketplace`).
2. Project → Settings → Domains → add `emmerdaleagriculture.com` (and `www` redirecting to apex). Set the A/CNAME records Vercel displays.
3. Free (Hobby) tier is sufficient at launch. Note Hobby tier prohibits commercial use per Vercel ToS — move to Pro ($20/mo) when the paid tier launches, at the latest.

### 12.3 Supabase

1. New project in the existing org — **do not reuse the Lumenira or HPM project.** Region: `eu-west-2` (London). Name: `emmerdale-marketplace`.
2. Save the database password to the password manager at creation — it is shown once.
3. Dashboard → Database → Extensions → enable `pg_cron`.
4. Free tier is fine to build on. **Known trap: free-tier projects pause after ~7 days of inactivity.** Upgrade to Pro (~£25/mo) before real contractors sign up, not after the first "site is down" message.
5. Auth → URL configuration: set Site URL to `https://emmerdaleagriculture.com` and add `http://localhost:3000` to redirect allow-list for local dev.

### 12.4 Resend

1. Existing account (or new — free tier: 3,000 emails/mo, 100/day). Domains → add `emmerdaleagriculture.com`.
2. Set the DKIM/SPF records Resend displays (typically 3 records). **This is the long pole — DNS can take hours to verify, so do it in the same sitting as 12.2's records.** Nothing sends until the domain shows Verified.
3. Create an API key scoped to sending. Sender identity: `network@emmerdaleagriculture.com` (create nothing at Resend for this — any address on the verified domain works).
4. Stripe: **skip entirely until Phase 4.** When reached: one Product, one Price (£20/mo recurring), webhook endpoint added then.

### 12.5 Environment variables

Claude Code should scaffold `.env.local` (gitignored) and mirror all values into Vercel → Settings → Environment Variables. Canonical set:

```bash
# Supabase — from Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # safe to expose; RLS is the guard
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # server-only. NEVER prefixed NEXT_PUBLIC.
                                            # Used by admin routes + Edge Functions.

# Resend
RESEND_API_KEY=re_...
EMAIL_FROM="Emmerdale Agriculture <network@emmerdaleagriculture.com>"

# App
NEXT_PUBLIC_SITE_URL=https://emmerdaleagriculture.com
ADMIN_EMAILS=tom@...                        # comma-separated; used to grant is_admin
                                            # claim on first login (or set claim via
                                            # SQL — Claude Code to pick one and document)

# Phase 4 only — leave unset until then
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_ID=
```

Edge Function secrets (Resend key, service role) are set separately via `supabase secrets set` — they do not inherit from Vercel.

### 12.6 Verification gate (end of Phase 0)

Phase 0 is done when all of the following are true, checked in this order:

1. `emmerdaleagriculture.com` resolves to the Vercel deployment (a "coming soon" holding page committed by Claude Code is fine).
2. Resend dashboard shows the domain **Verified**, and a test send from an API route lands in an inbox (not spam).
3. Migrations applied: all Section 3 tables exist, RLS enabled on every table, seeds loaded (counties, district_county_map, services — 15 rows).
4. `select * from cron.job;` shows the 5-minute schedule registered.
5. A test signup on the deployed site creates an `auth.users` row and a pending `contractors` row.

### 12.7 Running cost summary

| Service | Launch | Later trigger |
|---|---|---|
| Domain | ~£10/yr | — |
| Vercel | £0 (Hobby) | Pro $20/mo at paid-tier launch (ToS) |
| Supabase | £0 | Pro ~£25/mo before real contractor signups (pause trap) |
| Resend | £0 | Paid tier only if >3,000 emails/mo |
| Stripe | £0 | Per-transaction fees only, Phase 4 |

Launch: effectively £0/mo. Steady state with paid tier live: ~£45/mo before Stripe fees.

### 12.8 Environments & dev workflow

No self-managed environments exist; the split is:

- **Local dev:** Supabase CLI (`supabase start`) runs the full stack (Postgres, auth, Edge Functions) in Docker locally. All schema work is done as migration files (`supabase/migrations/`) committed to the repo — never hand-edited in the hosted dashboard. `supabase db push` / `supabase migration up` applies them to the hosted project. `.env.local` points at the local stack during development.
- **Preview:** automatic per-branch Vercel deployments. **Known limitation, accepted at launch:** previews share the production Supabase project (env vars are the same). Pre-launch this is harmless — there is no real data to endanger. Post-launch, treat previews as read-mostly and do destructive schema work locally first.
- **Production:** `main` → Vercel production → hosted Supabase project.

**Deferred, with trigger:** Supabase branching (per-branch database copies, Pro plan) — adopt when real contractor/customer data exists in production AND schema migrations start carrying risk. Not before: it costs money and adds workflow friction for zero benefit on an empty database.

Claude Code conventions: every schema change is a numbered migration; seeds live in `supabase/seed.sql`; RLS policies are part of migrations, not dashboard clicks — the entire database must be reconstructable from the repo alone (`supabase db reset` locally proves it).
