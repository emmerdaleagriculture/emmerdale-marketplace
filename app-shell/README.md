# Emmerdale Agriculture mobile app

Native iPhone/iPad and Android shells for the live marketplace. This directory
is a separate Node project from the website. Changes here do not require changes
to `src/`, the root package lock or the live database.

## Current preparation

- App ID: `com.emmerdaleagriculture.app`.
- Startup: `https://www.emmerdaleagriculture.com/app`.
- Capacitor 8.5.2, pinned across core, CLI and both platforms, with a committed lockfile.
- Native Xcode project using Swift Package Manager; native Gradle Android project.
- iOS minimum 15; Android minimum API 24, target/compile API 36.
- Square brand icon, generated launcher assets, branded splash images.
- Optional camera/photo and foreground-location purposes documented on iOS;
  Android foreground location permissions for the website's user-initiated button.
- Only the two Emmerdale website hosts are allowed in the WebView. Other hosts
  follow Capacitor's external-navigation handling, which still needs device tests.

Capacitor 8 requires Node 22+ and Xcode 26+; new iOS projects default to SPM
([Capacitor migration guide](https://capacitorjs.com/docs/updating/8-0)).
Apple requires Xcode 26+ and iOS 26 SDK builds for App Store Connect uploads from
28 April 2026 ([Apple requirements](https://developer.apple.com/news/upcoming-requirements/)).

## Local setup

Use Node 22 or newer. Run from this directory, not the repository root:

```sh
npm ci
npx cap sync ios
npx cap sync android
npm run check
python3 -m unittest discover -s scripts -p 'test_*.py'
```

Do not run `cap add` again: both native projects are committed, including
permissions and release settings. Generated native configuration and copied
web assets are intentionally ignored and recreated by `cap sync`.

### iOS

On a Mac with Xcode 26.3 installed:

```sh
npm run open:ios
```

Open `ios/App/App.xcodeproj` (not the old CocoaPods workspace). For a simulator
build, no paid Apple credentials are needed. A physical-device/TestFlight
build needs appropriate signing and Apple account access.

### Android

With JDK 21 and Android SDK 36 installed:

```sh
cd android
./gradlew assembleDebug testDebugUnitTest lintDebug
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. It is for
testing, not a Play release. Preview sessions use the live marketplace: do not
post test jobs or make payments without an approved test plan.

## Cloud previews

`Mobile preview builds` runs on relevant pull requests, or manually:

- iOS: selects Xcode 26.3, compiles without signing, boots an iPhone simulator,
  launches the app, captures a screenshot, and uploads the simulator `.app` ZIP.
- Android: builds a debug APK and runs unit tests and Android lint.

An iOS simulator `.app` cannot be installed on an iPhone. The screenshot is
launch evidence only; it does not certify login, payment or photo-upload flows.
GitHub artifacts from this public repository must contain no signed-in
customer/admin screenshots, personal data or signing credentials.

## Store uploads are deliberately disabled

No tag or push event uploads to a store. Both release workflows require:

1. Explicit approval to upload.
2. Repository variable `MOBILE_STORE_UPLOADS_ENABLED=true`.
3. Manual dispatch with `confirm_upload=true`.
4. Valid signing credentials and a store app record.

These gates have NOT been enabled by preparation. The Play workflow targets
the internal track as a draft, never production. TestFlight uploading does not
automatically invite testers or publish on the App Store.

Read [release readiness](RELEASE-READINESS.md) before enabling either workflow.

## Icons and dependency maintenance

`npm run assets:ios` and `npm run assets:android` regenerate images from
`assets/icon.png` (the square store mark) and `assets/splash.png`. Generated
native images are committed, so CI builds do not need to run the image tool.
Pinned overrides update the asset tooling's transitive tar, sharp and uuid
dependencies; re-run asset generation, `cap sync`, and `npm audit` when changing
these versions. The root website dependencies are untouched.
