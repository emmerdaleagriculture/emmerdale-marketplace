# Emmerdale mobile release readiness

Prepared 25 September 2026. This is a build-preparation record, not confirmation
that either app has passed store review or been installed on a physical device.

## Current account checkpoint

- Google Play: phone verification saved and Create app unlocked. The app record
  has not yet been created in the reviewed console.
- Apple: enrolment remained under review and support was contacted.
  Recheck approval before configuring distribution signing.
- No production deployment, store submission, tester invitation or signing-key
  creation is part of this preparation branch.

## Build and upload prerequisites

### iOS / TestFlight

After Apple membership approval:

1. Register the exact bundle ID `com.emmerdaleagriculture.app`.
2. Create the Emmerdale Agriculture app record in App Store Connect.
3. Obtain an Apple Distribution certificate and matching App Store provisioning
   profile, and an App Store Connect API key with appropriate upload permission.
4. Store the following as repository Actions secrets, never in files or chat:
   `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_ID`, `APPSTORE_PRIVATE_KEY`,
   `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`,
   `IOS_PROVISIONING_PROFILE_BASE64`.
5. Review this branch and the test results. Obtain explicit upload approval.
6. Only then enable `MOBILE_STORE_UPLOADS_ENABLED` and manually run `iOS TestFlight`.
7. Resolve App Store Connect processing/export-compliance questions, then approve
   the appropriate tester invitation. Do not treat an upload as an invitation.

The signing helper validates profile expiry, exact bundle ID and distribution
type, derives the team ID, creates an ephemeral signing keychain, and removes
the profile/key material afterwards. Its archive/upload path cannot be exercised
until real credentials exist; an unsigned simulator pass does not prove signing.
Each release run uses its workflow run number for build numbering. Before a first
run or after uploads from another system, confirm this exceeds the store's
existing build number; rerun a failed workflow as a new dispatch, not with a reused number.

### Android / Play

1. Create a free application named Emmerdale Agriculture, default language en-GB,
   with the same package ID. Have the account holder approve store declarations.
2. Enrol in Play App Signing and securely back up the upload keystore.
   App-signing keys and upload keys are different: do not reuse the old handoff's
   claim that loss of any upload keystore permanently prevents updates.
3. Add Actions secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`.
4. Grant the service account only required app/track permissions.
5. First release may require a manual AAB upload in the Play Console before
   publishing API calls work. Complete store setup and declarations first.
6. Only with upload approval, enable the upload variable and dispatch Android Play.
   This creates an internal-track draft; it does not release to production.

See [Google's app-signing guidance](https://developer.android.com/studio/publish/app-signing)
and [Apple TestFlight guidance](https://developer.apple.com/testflight/).

## Required device acceptance tests

Use controlled accounts and an approved job/payment test plan. The wrapper opens
the live website, so test submissions can contact real operators.

- Cold start: correct brand icon, splash, welcome screen, no white screen.
- Existing customer, contractor and admin: login, session persistence, expected
  dashboard, logout, and expired-session recovery.
- Password/magic-link/email login: establish how browser-to-app return works.
  Universal/app links are not configured; external links may remain in the browser.
- Job flow: all current services, mobile keyboard, forms, back navigation.
- Location: permission is requested only on the user action; grant/deny and manual
  postcode fallback. Check the actual recipients/storage of coordinates.
- Photos: camera, photo library, cancelled selection, upload and denied permission.
- Checkout: external Stripe navigation, 3DS/bank-app challenge, return to the right
  job, cancellation and duplicate-charge protection. These paths are unverified.
- Android back button: verify useful history and exit behaviour.
- Network: first launch offline, lost connection, resume and retry.
- Accessibility: large text, VoiceOver/TalkBack, safe areas, rotation and small screens.
- Notifications: push is not implemented. Do not promise it in store copy.

## Store and privacy blockers

The earlier store questionnaires are historical drafts and must not be pasted
into the stores. The site now offers device location; current Google/Meta
tracking behaviour, consent, payment flow and data sharing need a fresh audit.
Adding permission descriptions does not resolve App Privacy, Data Safety or ATT.

Also verify account-deletion requirements, provide a controlled reviewer account,
capture screenshots from real builds, create the Play feature graphic and
re-check claims in listing copy against the live service.

Apple's minimum-functionality review risk remains: a website wrapper is not
guaranteed approval. Native build success and business-account approval are
separate from app-review approval
([Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)).

## Validation

- Native project generation and sync are executable with the committed lockfile.
- `npm run check` checks identity, pinned dependencies, HTTPS/navigation scope,
  iOS permission strings and generated configuration.
- `python3 -m unittest discover -s scripts -p 'test_*.py'` checks signing-profile
  validation and malformed/expired/wrong-type profile rejection.
- GitHub Actions checks compile/simulator launch and Android debug/lint/unit tests.
  Consult the PR checks for the actual result; workflow presence alone is not a pass.
- Signed builds, store processing and physical-device journeys remain untested
  until the account, credentials and controlled test plan are ready.
