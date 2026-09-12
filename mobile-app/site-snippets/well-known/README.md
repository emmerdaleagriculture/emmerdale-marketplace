# Deep linking (Universal Links / App Links)

Optional, and safe to do *after* launch. What it buys you: someone with the
app installed who taps an emmerdaleagriculture.com link on their phone lands
in the app rather than the mobile browser. Without it every link opens Safari
or Chrome, even for people who have the app.

## Where these files go

Both must be served from the site root over HTTPS, with no redirect:

| File | Served at | Content-Type |
|---|---|---|
| `apple-app-site-association` | `/.well-known/apple-app-site-association` | `application/json` (no `.json` extension on the file) |
| `assetlinks.json` | `/.well-known/assetlinks.json` | `application/json` |

In this Next.js project, put both in `public/.well-known/`. Vercel serves
`public/` as static files, so they will be at the right URLs automatically.
Apple's file must *not* have a `.json` extension — that trips people up.

## What to fill in first

- `TEAMID` — your Apple Developer Team ID (App Store Connect > Membership),
  a 10-character string. The full value looks like `A1B2C3D4E5.com.emmerdaleagriculture.app`.
- `sha256_cert_fingerprints` — the SHA-256 of the **release** signing
  certificate. If you let Google Play sign the app (Play App Signing, the
  default), take it from Play Console > Setup > App integrity, not from your
  local keystore, or links will silently fail in production.

## The native side

Each platform also needs to declare the domain:

- **iOS**: in Xcode, target App > Signing & Capabilities > add "Associated
  Domains", then add `applinks:emmerdaleagriculture.com`.
- **Android**: add an intent filter with `android:autoVerify="true"` for the
  domain in `android/app/src/main/AndroidManifest.xml`.

## Verifying

- Apple: `https://app-site-association.cdn-apple.com/a/v1/emmerdaleagriculture.com`
- Google: `https://developers.google.com/digital-asset-links/tools/generator`

Apple caches its copy through a CDN, so changes can take a day or so to take
effect. Test on a real device — Universal Links do not work in the simulator.
