# Emmerdale Agriculture mobile app — handoff

**Date:** 12 September 2026
**Prepared for:** Nav Ramiah, and whoever picks up the build next
**Status:** website code written and in an open PR; native build not yet started

This document is written to be read cold. It assumes you know nothing about
what was decided or why, and it is explicit about what is done, what is
untested, and where the real risks are.

---

## 1. What this project is

Get Emmerdale Agriculture onto the Apple App Store and Google Play.

The approach chosen is a **Capacitor native shell around the live website**
rather than a rebuilt native app. The app is a real native binary with a real
icon, splash screen and native WebView, but the content it shows is
emmerdaleagriculture.com, live. There is no separate app content to build or
deploy — ship the website, and the app changes with it.

### Why not a native rebuild

This was the central decision, and it was made on evidence rather than taste.
The marketplace is under fast, active development — roughly 150 commits and 60
database migrations, with features landing most days (three commits landed on
`main` during the few hours this work was done). A separate React Native
codebase would mean every feature being built twice, forever, by a team that
is currently one or two people. The wrapper keeps one codebase and one source
of truth.

The trade-off is real and is named honestly in section 7: Apple sometimes
rejects apps that are "just a website in a box." That risk is understood, is
partly mitigated already, and has a known remedy.

---

## 2. What is DONE

### 2.1 The `/app` entry screen — written, pushed, awaiting merge

> **PR #58** — "Add /app entry screen for the wrapped mobile app"
> Repo: `emmerdaleagriculture/emmerdale-marketplace`
> Branch: `app-shell-entry-point` → `main`
> Status: open, mergeable, checks passing. **Nav's team merges it, not me.**

**What it adds** (three-dot diff against `main`, verified):

| File | Change |
|---|---|
| `src/app/(frontend)/app/page.tsx` | new, 99 lines |
| `src/app/(frontend)/app/app.module.css` | new, 178 lines |
| `src/app/robots.ts` | +3 / −2 lines |

Nothing existing is modified. The branch is one commit behind `main` with no
conflicts.

**Why the route exists.** Installing the app is by definition a *second*
visit — nobody installs an app for a company they have not already found. So
the marketing homepage (founder story, service board, coverage map,
testimonials) has nothing left to sell an app user. The app boots to `/app`
instead: a single screen with one obvious action.

**What it does.** Signed-in users never see it — it calls `postLoginPath()`,
the exact function `/login` already uses, so a contractor lands on the job
board and a customer on their jobs, identical to logging in on the website.
Signed-out users get the hero screen: photo, headline, one full-width "Book
online" button to `/start`, three trust chips, and a quiet contractor
footnote to `/signup`.

**The copy is quoted, not invented.** This mattered to Nav and was verified
line by line against the live codebase:

| On the screen | Source in the repo |
|---|---|
| "Tell us what needs doing" | `/start` page's own `<h1>` |
| "In your own words — we'll pass it to contractors who cover your area." | `/start` page's own standfirst |
| "Book online" | the site nav's CTA (`HomeHeader.tsx`) |
| "Free, and no obligation" | homepage services section |
| "Prices upfront" / "Fully insured" / "Vetted & fully trained" | homepage `TRUST` array |
| "Do you run an agricultural contracting business?" | homepage operators section `<h2>` |
| "Apply to join" | that section's own button |
| Hero photo | `public/john-deere-6250r.webp`, already in the repo |

Nothing on this screen is new marketing language. If the site's copy changes,
this screen should be updated to match.

**Verification performed** (npm is blocked in the environments available, so a
full `next build` was not possible — see section 6):

- Every one of the 21 CSS classes referenced exists in the stylesheet.
- Every CSS custom property used is defined in `globals.css`.
- `postLoginPath(userId, email, side?)` signature confirmed against current
  `main` — it was *not* changed by the commits that landed today, though
  `auth.ts` was edited (a new `nonContractorPath()` was added alongside it).
- `getUser()` returns the Supabase `User`, so `.id` and `.email` are valid.
- `MinimalHeader` is a named export (not used in the final hero version).
- The `(frontend)` layout renders only `{children}` — no duplicated header.
- `sitemap.ts` is a hand-curated list, so `/app` cannot leak into it.
- No route previously occupied `/app`.
- TypeScript parses the file with **zero syntax errors**.
- The committed file was diffed byte-for-byte against the locally verified
  version: **identical**.
- The CSS was rendered in a real browser at device sizes to confirm it looks
  right (see `store-assets/`).

**Not verified:** a real `next build`, `next lint`, and behaviour against a
live Supabase session. Those need running in an environment with npm access.
Vercel's preview build on the PR is the natural place for that — check it.

### 2.2 The Capacitor app shell — built, in `app-shell/`

Complete and ready to build from, except for the platform folders, which
cannot be generated without npm (section 6).

- `capacitor.config.ts` — app ID `com.emmerdaleagriculture.app`, points at
  `https://emmerdaleagriculture.com/app`, iOS `contentInset: 'automatic'`.
- `package.json` — Capacitor dependencies and convenience scripts.
- `www/index.html` — placeholder Capacitor's CLI requires but never shows.
- `assets/icon-store-square.png` — **1024×1024, square corners.** Generated
  from the site's own `src/app/icon.svg`, with the SVG's built-in `rx="12"`
  corner rounding stripped, because both stores apply their own mask and
  reject or double-round pre-rounded icons. **This is the one to submit.**
- `assets/icon.png` — same mark with rounding left in. Reference only.
- `assets/splash.png` — 2732×2732, mark centred on `#17330d`.
- `README.md` — setup, deploy, and store checklist.

The icon and splash are derived from the real brand mark in the repo, not
invented artwork.

### 2.3 Store screenshots — in `store-assets/`

Rendered at each store's exact required pixel dimensions, using the real
stylesheet, real fonts, real copy and the real hero photo:

- `appstore-iphone-6.7in-1290x2796.png`
- `appstore-iphone-6.9in-1320x2868.png`
- `playstore-phone-1080x1920.png`
- `design-reference-approved.png` — the mockup Nav approved, for comparison.

**Caveat, stated plainly:** these are renders of the page's real CSS, not
captures from a running build on a device. They are accurate and usable for a
first submission, but **recapture them from the simulator once the app runs**
— font rendering and safe-area insets can differ slightly, and store
screenshots are supposed to show the actual app.

You will also need more than one screenshot to make a decent listing. Capture
the `/start` job flow and the confirmation screen from the simulator too.

**Still missing: the Google Play feature graphic (1024×500).** It is mandatory
for a Play listing and has not been made.

### 2.4 CI workflows — in `ci-workflows/`

Two GitHub Actions workflows that build and submit the apps **without anyone
needing a Mac**. Both are valid YAML (checked) but **neither has ever been
run** — treat them as a strong first draft, not proven infrastructure.

- `ios-testflight.yml` — builds on a GitHub-hosted `macos-14` runner, signs,
  exports an IPA, uploads to TestFlight.
- `android-play.yml` — builds an AAB on Linux, signs it, uploads to the Play
  internal testing track.

Each file's header comments list the exact repo secrets required and how to
produce them. They go in `.github/workflows/` in the main site repo.

⚠️ **The Android signing keystore is irreplaceable.** If it is lost, Google
will never allow an update to that listing again — a new listing and new URL
would be the only route. Back the `.jks` up outside the repo before starting.

### 2.5 Site integration — in `site-snippets/`

- `AppDownloadLinks.tsx` + CSS module — store badge component for the footer.
  Deliberately renders `null` until the store URLs are filled in, so it can be
  merged and deployed before the apps exist without showing dead links.
- `smart-app-banner.md` — the one meta tag that makes iOS Safari offer the app.
- `well-known/` — `apple-app-site-association` and `assetlinks.json` for
  Universal Links / App Links, plus a README explaining exactly where they go,
  what to fill in, and the two classic mistakes (Apple's file must have no
  `.json` extension; the Android fingerprint must come from Play App Signing,
  not your local keystore).

Deep linking is a post-launch nicety. Do not let it hold up submission.

### 2.6 Store listing content — in `store-listing/`

- `listing-copy.md` — app name, subtitle, short and full descriptions,
  keywords, categories, URLs. Every character count was measured against the
  store limits, not estimated.
- `review-notes-and-privacy.md` — App Review notes, the Apple privacy
  questionnaire answers, the Google Data Safety answers, the required
  `Info.plist` permission strings, and a frank assessment of the rejection
  risk.

---

## 3. What is NOT done

| # | Item | Blocked by |
|---|---|---|
| 1 | Merging PR #58 | Nav's team — deliberately left to them |
| 2 | `npx cap add ios` / `add android` (generating the native projects) | npm registry blocked (section 6) |
| 3 | Apple Developer Program enrolment (£79/$99 a year) | needs Nav — payment and identity |
| 4 | Google Play Console account ($25 one-off) | needs Nav |
| 5 | Signing certificates and the Android keystore | needs the developer accounts first |
| 6 | Any actual build, TestFlight upload, or store submission | items 2–5 |
| 7 | Play Store feature graphic (1024×500, mandatory) | not made |
| 8 | Extra store screenshots beyond the entry screen | needs a running build |
| 9 | Push notifications | not built; see section 7 |
| 10 | Store badge images in `public/` | download from Apple/Google |
| 11 | A demo contractor account for Apple's reviewers | needs someone to create and approve one |

---

## 4. The exact next steps, in order

1. **Merge PR #58.** Confirm `https://emmerdaleagriculture.com/app` loads, and
   that a signed-in user is redirected away from it correctly. Check the
   Vercel preview build on the PR passes first — that is the real build test
   that could not be run here.
2. **Open the two developer accounts.** Apple's is the long pole: a company
   enrolment needs a D-U-N-S number and can take days to weeks. Start it
   before anything else. Google's is same-day.
   ⚠️ Google now requires new *personal* developer accounts to run a closed
   test with 20 testers for 14 days before a production release. Check whether
   this applies; if it does, it sets the Android timeline, not the build.
3. **Generate the native projects.** On any machine with working npm:
   ```bash
   cd app-shell
   npm install
   npx cap add ios
   npx cap add android
   npx @capacitor/assets generate \
     --iconBackgroundColor '#17330d' --splashBackgroundColor '#17330d'
   ```
   Commit the resulting `ios/` and `android/` folders — the CI workflows work
   either way, but committing them makes builds faster and reproducible.
4. **Build locally once** (needs a Mac with Xcode for iOS) to prove it runs,
   before wiring up CI. `npx cap open ios` / `npx cap open android`.
5. **Set up the CI workflows** with the secrets listed in their headers, and
   run each manually once.
6. **Create the store listings**, using `store-listing/`. Register the app
   under `com.emmerdaleagriculture.app` — it cannot be changed afterwards.
7. **Submit.** Apple's review is typically 24–48 hours; Google's is faster
   but subject to the testing rule above.
8. **After the apps are live:** fill the two URLs into `AppDownloadLinks.tsx`,
   add the badge images to `public/`, and add the smart app banner meta tag.
9. **Then consider** push notifications and deep links.

---

## 5. Key facts someone will need

| Thing | Value |
|---|---|
| Site repo | `emmerdaleagriculture/emmerdale-marketplace` (public) |
| Stack | Next.js 15 App Router, React 19, Supabase, Vercel, Resend |
| Styling | CSS Modules + global custom properties. **No Tailwind** |
| App ID / package | `com.emmerdaleagriculture.app` |
| App entry URL | `https://emmerdaleagriculture.com/app` |
| Brand green (deep) | `#17330d` (`--jd-green-deep`) |
| Brand green (dark) | `#245018` (`--jd-green-dark`) |
| Brand yellow | `#ffde00` (`--jd-yellow`) |
| Fonts | Tenor Sans (display), DM Sans (body) |
| Privacy policy | `https://emmerdaleagriculture.com/privacy` |
| Contact | `tom@emmerdaleagriculture.com` |
| GitHub access | Nav (`nav-ramco`) has write access, confirmed 12 Sep |

---

## 6. Constraints hit during this work — read before retrying anything

These are environmental, not design problems. Knowing them saves the next
person an hour.

- **npm's registry returns HTTP 403** from both the cloud sandbox and the
  Linux VM bridged to Nav's Mac. This is an organisation egress policy, not a
  misconfiguration — `registry.npmjs.org` is even on the proxy bypass list and
  still 403s. Consequence: no `npm install`, no `npx cap add`, no `next build`,
  no lint. Any machine outside that policy is fine.
- **Xcode was never reachable.** The bridge to Nav's Mac provides a *Linux VM*
  on that machine, not macOS, so no Apple toolchain is available through it.
- **The live site is not reachable** from the cloud sandbox (egress policy), so
  screenshots were rendered from the repo's own CSS and assets instead of
  captured from production.
- **`api.github.com` is blocked**, but plain `git clone` over HTTPS works
  fine. That is how the codebase was read.
- **Code was pushed through GitHub's web editor**, driven via a browser on
  Nav's Mac, because there are no git push credentials in the sandbox. This
  works but is error-prone: one edit silently landed in a dialog's description
  box, and another produced `'/won'],, '/app'`. **Every file was therefore
  diffed against a locally verified copy after committing.** Do the same if
  you edit this way, or just use a normal git client.

---

## 7. Risks, honestly

**Apple guideline 4.2, "minimum functionality."** This is the one that
matters. A WebView wrapper is a legitimate architecture but is also exactly
what 4.2 targets. In this app's favour: the job-posting flow's file input
triggers the real native camera and photo picker inside a WebView; the app has
its own dedicated entry screen rather than opening the marketing homepage; and
the icon, splash and presentation are properly native. If rejected anyway, the
strongest remedy is **push notifications** — a capability a website genuinely
cannot offer, and the honest answer to what 4.2 is testing for. It is scoped
but not built: it needs a device-token table, wiring into the existing
`notify-new-job` Edge Function so a push fires alongside the email it already
sends, and Apple/Google push credentials. Contractors deciding whether to bid
on a job that closes in 24 hours are the obvious audience, so it is worth
building on its own merits.

**The CI workflows are unrun.** Valid YAML is not a working pipeline. Expect
to iterate on the signing steps in particular — that is where these always
break. Build locally once first so you know the difference between "my
workflow is wrong" and "my certificates are wrong."

**Screenshots are renders, not captures.** Accurate, but recapture from a real
build before you rely on them.

**Data deletion.** Google Play requires a data deletion route and URL. Check
`/privacy` actually covers this before submitting — it is a policy rejection if
not, and a content fix rather than an engineering one.

**Tracking answer.** The site runs Google Analytics and a Meta pixel. The
privacy questionnaire assumes these are not used for cross-app ad targeting,
so "Tracking: No" is the stated answer. If marketing is in fact retargeting
with the Meta pixel, that answer is wrong and App Tracking Transparency
becomes mandatory. Confirm with whoever owns marketing rather than assuming.

---

## 8. What is in this pack

```
HANDOFF.md                         this document
app-shell/                         the Capacitor project
  capacitor.config.ts              app ID + the /app entry URL
  package.json, www/index.html
  assets/icon-store-square.png     1024×1024, square — submit this one
  assets/icon.png                  rounded variant, reference only
  assets/splash.png                2732×2732
  assets/README.md, README.md
ci-workflows/
  ios-testflight.yml               macOS runner → TestFlight
  android-play.yml                 Linux runner → Play internal track
site-snippets/
  AppDownloadLinks.tsx / .module.css
  smart-app-banner.md
  well-known/                      deep-link files + README
store-assets/                      screenshots at exact store dimensions
store-listing/
  listing-copy.md                  name, descriptions, keywords (counts checked)
  review-notes-and-privacy.md      review notes, privacy + data safety answers
```

---

## 9. A note on design decisions, so they are not silently undone

Two things were chosen deliberately and would look like mistakes to someone
arriving cold:

**The large empty space** on the entry screen between the trust chips and the
contractor footnote is intentional. The footnote is anchored to the bottom by
a flex spacer so it reads as a footnote rather than a second, competing
choice. Filling that space would undermine the whole point of the design,
which is a single obvious action.

**The hero layout beat a two-card layout.** An earlier version offered "Book
online" and "Join the network" as two equal cards. Nav chose the hero. The
reasoning is that the overwhelming majority of app users are customers, so
giving contractors equal visual weight on the first screen taxes every
customer to serve a minority. The two-card version was built, reviewed and
deliberately replaced — it is in the branch history (commit `7dd4276`) if
anyone wants to see it.
