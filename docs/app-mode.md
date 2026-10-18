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
