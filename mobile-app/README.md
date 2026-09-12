# Mobile app (App Store / Google Play)

This folder + `/app-shell` at the repo root hold the handoff pack for wrapping
this site as a native app. Full context: [`HANDOFF.md`](./HANDOFF.md).

- `../app-shell/` — the Capacitor project. Run `npm install && npx cap add ios && npx cap add android` here (needs a machine with npm registry access) to generate the native `ios/`/`android/` projects, then commit them.
- `../.github/workflows/ios-testflight.yml` / `android-play.yml` — CI builds, manual-dispatch only until the required repo secrets are set (see each file's header) and they've been run and verified once.
- `site-snippets/` — not yet wired into the live site: the `AppDownloadLinks` footer component (renders nothing until store URLs exist), the smart app banner tag, and the `.well-known` deep-link files.
- `store-listing/` — ready-to-paste App Store Connect / Google Play Console copy, review notes, and privacy/data-safety answers.
- `store-assets/` — screenshot renders at each store's required dimensions (recapture from a real simulator build before final submission — see HANDOFF.md).

Status as of 2026-09-12: `/app` entry screen is live on production (PR #58
merged). Native projects, developer accounts, and CI secrets are not yet set
up — see HANDOFF.md section 3 for the full outstanding list.
