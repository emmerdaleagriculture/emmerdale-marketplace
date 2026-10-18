# App mode

The iPhone and Android apps are a Capacitor frame around the live website
(`app-shell/`, `mobile-app/HANDOFF.md`). In that frame the site runs in **app
mode**: no website header or footer, a bottom tab bar, safe-area padding, and
the native sign-in / phone / push flows. Nothing in app mode shows on the
website. This file is the map; the code comments carry the detail.

## How the site knows it is in the app

| Where | Signal | Code |
|---|---|---|
| Middleware | `EmmerdaleApp/<version>` in the user agent → request header `x-ea-app: 1` | `src/middleware.ts`, `src/lib/appMode.ts` |
| Server pages | `isAppRequest()` (header, then UA, then cookie) — dynamic pages only | `src/lib/appMode.server.ts` |
| First paint | an inline script in the root layout sets `<html data-app="1" data-platform="ios|android">` from the UA before the body renders | `src/app/(frontend)/layout.tsx` |
| Browser code | `isApp()` for layout decisions, `isNativeApp()` before any Capacitor plugin call | `src/lib/app/isApp.ts` |

**Looking at app mode in a desktop browser:** open any page with `?app=1`.
That sets the `ea_app` cookie for 30 days; `?app=0` clears it. Playwright
runs can also just send the app user agent.

**What the frame must do:** append `EmmerdaleApp/<app version>` to the
WebView user agent (`appendUserAgent` in `capacitor.config.ts`). The website
installs `@capacitor/core` and `@capgo/capacitor-social-login` at major
version 8, so the frame's Capacitor and plugin versions need to match that
major.

## What changes in app mode

- Components marked `data-app-hide` (site header, footer, minimal header,
  home header/footer, breadcrumbs) are `display: none` from the first paint.
- `AppShell` (`src/components/app/`) draws the tab bar on tab pages and a back
  bar on inner screens, and sets `data-app-tabs` / `data-app-back` on
  `<html>` so the stylesheet can pad for them. Tabs: customers Home · My jobs
  · Messages · Account, contractors Jobs · Diary · Messages · Earnings
  (`tabs.ts`). Badge counts come from `/api/app/badges`.
- `/app/home` and `/app/account` are the customer's Home and Account tabs;
  `/messages` is the Messages tab for both sides. The other tabs are the
  existing pages.
- Sign-out returns to `/app` instead of `/`.
- `globals.css` has an `html[data-app]` block: cream background, no
  overscroll, safe-area variables, and `.appFooterCta` for a screen's one
  fixed bottom button.

## Signing in (tasks 2–4)

- `/app` is the welcome screen: hero, the home page's proposition, then
  Continue with Apple / Google / email. Apple first on an iPhone, Google
  first on Android. "Run a contracting business? Apply to join" flips the
  copy and carries `role=contractor` through to the role screen.
- `SignInButtons` (`src/components/app/`) is shared with the website's
  `/login` and `/signup`. In the frame it uses the native sheets
  (`src/lib/app/nativeSignIn.ts`, `@capgo/capacitor-social-login`) and
  `supabase.auth.signInWithIdToken`; everywhere else `signInWithOAuth`,
  returning through `/auth/callback`, which routes by role when no `next`
  is given.
- Apple nonce: the sheet gets the SHA-256 of a random value, Supabase gets
  the value. Google gets no nonce (its native ID token carries none).
- `/app/email` is "Continue with email": `signInWithOtp` (creates the
  account if needed; Turnstile token forwarded, captcha is enforced on that
  endpoint) then `verifyOtp({ type: 'email' })`. The hosted project's
  magic-link template prints `{{ .Token }}` and the email OTP length is 6
  (set 2026-10-18 through the management API; `supabase/templates/
  magic_link.html` and `config.toml` mirror it).
- `/app/continue` is where every sign-in ends: tabs if a profile row
  exists, otherwise `/app/role`, which creates the `customers` row or hands
  over to `/onboarding` for a contractor.

### Supabase settings still needed (with the keys Nav supplies)

| Setting | Value |
|---|---|
| Auth → Providers → Apple | enabled; client id = Services ID; secret = generated from the .p8 key (expires every 6 months); **add the iOS bundle id `com.emmerdaleagriculture.app` to the authorised client ids** so native ID tokens verify |
| Auth → Providers → Google | enabled; client id = Web client id, secret = Web secret; **authorised client ids = iOS client id (and Android client id if used)** |
| Auth → URL configuration | `https://www.emmerdaleagriculture.com/auth/callback` is already covered by the `/**` allow-list entry |
| Vercel env (public) | `NEXT_PUBLIC_APPLE_SERVICES_ID`, `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` |

Account linking: Supabase links a Google or Apple identity to an existing
account with the same verified email automatically (manual linking is off),
so an existing contractor signing in with Google on their usual address
lands in their own account. Apple's "Hide My Email" relay addresses do not
match; that case is handled after the phone step (task 5).

## The phone step (task 5)

- `/app/phone`: +44 by default, UK mobiles only (`lib/sms/ukMobile`), saved
  as E.164. `supabase.auth.updateUser({ phone })` sends the code,
  `verifyOtp({ type: 'phone_change' })` confirms it. On success the number
  is written to `customers.phone` / `contractors.phone` with
  `phone_verified_at` (migration `20261018120000`). Nothing downstream
  changes: texts and the masking rules read the same columns as before.
- Resend after 30 s; five wrong codes lock the number for ten minutes
  (`phone_verifications`, service role only).
- **The gate** is in `lib/supabase/middleware.ts`: an app request from a
  signed-in user whose JWT has no `phone` claim is redirected to
  `/app/phone?next=…`, except on the welcome/sign-in/role/phone screens and
  the auth routes. Admins are exempt. The claim only appears once Supabase
  has confirmed the number, so existing accounts are asked the first time
  they open the app.
- `/app/phone/match`: if the verified number is already verified on another
  account (Apple "Hide My Email"), the person is asked whether that account
  is theirs; "yes" emails a code to that account's address, signs them in
  there, and removes the empty duplicate. "No" keeps the new account.
- A contractor who verified in the app sees the number read-only in
  `/onboarding`; changing the number on `/my` or `/account` clears
  `phone_verified_at`.

### Supabase settings for the phone step (with Nav's Twilio Verify SID)

| Setting | Value |
|---|---|
| Auth → Providers → Phone | enabled; provider **Twilio Verify**; Verify service SID + account SID/auth token |
| Phone confirmations | on (`sms_autoconfirm` false — already so) |
| SMS OTP expiry | 300 s (set 2026-10-18; was 60) |
| SMS rate limits | `sms_max_frequency` 5 s (the app enforces 30 s itself); sent/hour 30 — raise before launch |
| `.env` | nothing new; the website never sends the code |

## Push notifications (task 7)

- **Devices:** `device_tokens` (user, platform, token, app version, last
  seen, revoked). The app registers on every open through
  `POST /api/app/device-token` (`src/lib/app/push.ts`, called from
  `AppShell`), and revokes on log out (`LogoutButton`) or when the Account
  switch is turned off.
- **Queue:** `pending_push`, filled by the `pending_emails_queue_push`
  trigger for these email kinds, only when the recipient has a live device:
  contractors `sq_invitation`, `sq_award_won`, `sq_message_to_contractor`,
  `sq_payout_sent`, `application_approved`; customers `sq_first_quote`,
  `sq_new_quotes`, `sq_message_to_client`, `sq_completion_confirm`,
  `sq_quotes_nudge_1/2` (the day-3 and day-6 follow-ups). Off switch:
  `app_config.sq_push_enabled = 0`.
- **Sending:** `supabase/functions/send-emails/push.ts`, after the texts,
  through FCM HTTP v1 with the service account in the Supabase secret
  `FIREBASE_SERVICE_ACCOUNT` (the JSON file's contents as one string).
  Titles and bodies follow the PRD table (`renderPush`). Quiet hours
  08:00–20:59 UK for anything not urgent; urgent = messages, a job won, and
  premium / first-refusal invitations. Dead tokens (FCM `UNREGISTERED`) are
  revoked automatically.
- **Taps:** the message's `data.url` is `/t/<code>`, the same short link a
  text uses; `sms_link_hit` now looks in both tables. The frame does not
  need to handle the tap: `listenForPushTaps` navigates to the URL. A
  premium invitation opened from a push sets `job_invitations.opened_at`
  on the price page, which is what the two-hour untapped rule checks.
- **Asking:** `/app/notify` once per device (cookie `ea_push_asked`), reached
  from `/app/continue` after the role and phone steps; "Turn on" calls the
  system prompt, "Not now" goes to the tabs. Account has the switch.

Deploy order: app (this PR) → `supabase functions deploy send-emails` →
set `FIREBASE_SERVICE_ACCOUNT` with `supabase secrets set`. Migration
`20261018150000` is already applied; without the secret the drain reports
`configured: false` and rows wait.

## App links, account deletion, reviewer accounts (task 10)

- **App links.** `/.well-known/apple-app-site-association` and
  `/.well-known/assetlinks.json` are route handlers (rewrites in
  `next.config.mjs`) so the team id and the Android fingerprint come from
  the environment: `APPLE_TEAM_ID` (defaults to G3UHKZ4LQ2), `APPLE_BUNDLE_ID`,
  `ANDROID_CERT_SHA256` (Play App Signing's SHA-256, comma-separated if
  several; until set, Android treats the links as web links). The bare
  domain 308-redirects to www, and Apple refuses a redirected file, so the
  app's Associated Domains entry must be `applinks:www.emmerdaleagriculture.com`
  (and `webcredentials:`). Paths covered: `/app*`, `/t/*`, `/my/*`,
  `/quote/*`, `/messages*`, `/invitations*`, `/won*`, `/jobs*`, `/account*`,
  `/start*`, `/login*`.
- **Delete my account.** `/app/account/delete`, linked from both Account
  screens in app mode. `lib/deleteAccount.ts`: Apple token revoked where
  held, devices revoked, premium cancelled, then — contractor without
  history: row removed; with history: row scrubbed (name, phone, email,
  counties; status suspended; live prices closed) and kept as a tombstone
  for the six-year records; customer: `closeCustomer` (open jobs withdrawn,
  details scrubbed from every job, photos removed, login deleted). The
  screen says what stays. Migration `20261018170000` dropped the
  `contractors.id → auth.users` cascade to make the tombstone possible; the
  admin delete tool now removes the row itself.
- **Apple token revocation.** Needs `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
  `APPLE_PRIVATE_KEY` (.p8 contents), `APPLE_SERVICES_ID`. The refresh token
  is captured at sign-in: on the web from `/auth/callback`
  (`provider_refresh_token`), natively by exchanging the sheet's
  authorization code at `/api/app/apple-token` with the bundle id as client.
  Stored in `apple_tokens` (service role only).
- **Reviewer accounts.** `npx tsx scripts/seedDemoAccounts.ts` creates or
  refreshes `demo-customer@` and `demo-contractor@emmerdaleagriculture.com`
  (password printed; `DEMO_ACCOUNT_PASSWORD` to set it), both with a
  confirmed phone so the gate lets them in, two demo jobs (one with three
  prices, one booked) and two extra "Operator" contractors. Demo contractors
  cover no counties; demo jobs are `hidden_at`, so they are out of the admin
  board, metrics and coverage. Reviewers sign in with "Have a password from
  the website? Log in with it" on the email screen.

## Where's your land (task 6)

- `/app/location`: "Use my current location" (`@capacitor/geolocation` in
  the frame, browser geolocation elsewhere) or a postcode. The position is
  turned into the nearest postcode (postcodes.io), the postcode into a
  county (`lib/postcodes`), and the county into the number of approved
  operators the county pages already publish (`getCountyCoverage`). Zero
  says "Not covered yet"; nothing is claimed beyond that count.
- Saved to `customer_sites` (migration `20261018190000`: label, postcode,
  county, lat/lng, acres), the customer's own rows under RLS. Asked once
  after the phone step for a customer with no site (`/app/continue`, cookie
  `ea_site_asked` when skipped); Account lists sites and adds more; Home
  shows the first one on the "Get prices" card.
