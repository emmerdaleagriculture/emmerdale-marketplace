# Emmerdale Agriculture — app store shell

What this is: a thin native wrapper (using [Capacitor](https://capacitorjs.com))
around the live emmerdaleagriculture.com website, so it can be installed
from the App Store and Play Store as a real app. It does **not** re-implement
the site — the app just displays the live website inside a native container,
starting at a dedicated `/app` entry screen instead of the marketing
homepage. Whatever's live on the website is what app users see; there's no
separate build/deploy step for app content, ever.

This approach was chosen over building a separate native (React Native)
app because the website's backend is under active, fast-moving development
(new features shipping most days) — a second native codebase would mean
re-implementing every change twice, forever. Wrapping the live site keeps
one codebase, one source of truth. See the project's `/areas/mls-*`-style
reasoning discussed with Nav for the full trade-off.

## Why it needs its own entry screen

Someone installs this app *after* already finding the website — the
marketing homepage (hero, "how it works", testimonials) has nothing left to
sell them. So the app boots straight to `/app`, a new route on the main
site that skips straight to what people actually open the app to do: post
a job, or join as a contractor. Signed-in users skip this screen entirely
and land on their existing dashboard (job board for contractors, their jobs
for customers) — same routing the website's own login page already uses.

## What's included here

- `capacitor.config.ts` — points the app at `https://emmerdaleagriculture.com/app`.
- `package.json` — Capacitor dependencies and a few convenience scripts.
- `www/index.html` — an unused placeholder Capacitor's tooling requires (see
  the comment in the file).
- `assets/` — the app icon and splash screen, already generated from the
  site's real brand mark (see `assets/README.md`).

## Getting this live

The `/app` route is **already written and pushed** to the main site repo as a
pull request — it is not a patch you have to apply:

> **PR #58 — "Add /app entry screen for the wrapped mobile app"**
> `emmerdaleagriculture/emmerdale-marketplace`, branch `app-shell-entry-point`

It adds two new files (`src/app/(frontend)/app/page.tsx` and its CSS module)
and one line to `src/app/robots.ts`. Nothing existing is modified, and GitHub
reports it as cleanly mergeable.

1. **Merge PR #58.** Vercel deploys `main` automatically, so
   `https://emmerdaleagriculture.com/app` is live a minute or two later.
   Confirm it loads in a browser before going further.
2. **Before it is merged**, you can still test this shell end-to-end against
   the branch's own Vercel preview URL (Vercel builds every branch) — point
   `capacitor.config.ts`'s `server.url` at that preview URL's `/app` path
   temporarily, then switch it back to the production URL before submitting
   to the stores.

## Setup

Requires Node.js. For iOS builds you additionally need a Mac with Xcode and
an Apple Developer account (£79/$99 a year — required to submit to the App
Store, and to test on a physical iPhone rather than just the simulator).
For Android you need Android Studio (free).

```bash
npm install
npx cap add ios       # generates the native Xcode project
npx cap add android   # generates the native Android Studio project
```

This creates `ios/` and `android/` folders — the actual native projects.
They're not included here since I can't run the Capacitor CLI in the
environment I built this in (no network access to npm's package registry
there) — `npx cap add` fetches and scaffolds them from Capacitor's own
templates, which needs to happen wherever this is actually built.

Then open and run:

```bash
npm run open:ios       # opens ios/App/App.xcworkspace in Xcode
npm run open:android   # opens android/ in Android Studio
```

From Xcode or Android Studio, run on a simulator/emulator or a connected
device exactly as you would any other app.

If you change `capacitor.config.ts` later, run `npm run sync` to push the
change into both native projects.

## App icon and splash screen

Already generated from the site's real brand mark (`src/app/icon.svg` in
the main repo — pulled straight from GitHub, not invented) — see
`assets/` for the ready-to-submit files and `assets/README.md` for how to
turn them into the full platform-specific icon/splash set.

## A note on Apple's app review

Apple has, in the past, rejected apps that read as "just a website in a
box." A few things already work in this app's favour without extra effort:

- The site's job-posting flow (`/start`) already uses a plain file input
  for photo uploads — inside the Capacitor shell, that automatically
  triggers the native camera/photo picker, not a web upload dialog. No
  code change needed for that; it's a side effect of running in a real
  native WebView.
- A proper app icon, splash screen, and native install experience (all
  covered above) go a long way on their own.

The single most convincing addition, if review pushes back, is push
notifications (see below) — that's a capability a plain website genuinely
cannot offer, which is the crux of what reviewers are checking for.

## Not built yet: push notifications

This shell doesn't include push notifications yet — that's real new
backend work (a device-token table, wiring into the site's existing
`notify-new-job` Edge Function so a push fires alongside the email it
already sends, plus Apple/Google push credentials), not just app
configuration, and it needs your own Apple Developer and
Firebase/OneSignal accounts to set up. Worth doing as the very next piece
of work — contractors deciding whether to bid on a job that closes in 24
hours (or move fast in a 12-hour paid-member window) are exactly the
audience push notifications help most — but it's a separate, self-contained
follow-up rather than part of getting the app itself into the stores.

## App Store / Play Store submission checklist

- Register the app in App Store Connect and the Google Play Console using
  the exact `appId` from `capacitor.config.ts` (`com.emmerdaleagriculture.app`)
  — change it now, before first submission, if you'd rather use a
  different one; it can't be changed after the fact.
- Both stores want a privacy policy URL — the site already has one at
  `/privacy`.
- Screenshots: at minimum, one from a phone-sized simulator/device for each
  store. Whoever builds this can capture these straight from Xcode's/Android
  Studio's simulator once it's running.
- Apple's review typically takes 1–3 days; Google's is usually faster.
