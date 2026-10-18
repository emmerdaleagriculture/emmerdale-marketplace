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
