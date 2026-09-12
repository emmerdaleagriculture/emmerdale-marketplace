import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS app identifier. This exact string has to match what you
  // register in App Store Connect and the Google Play Console — pick it
  // once and don't change it later (both stores treat it as the app's
  // permanent identity).
  appId: 'com.emmerdaleagriculture.app',
  appName: 'Emmerdale Agriculture',

  // Required by Capacitor's tooling even though it's unused below — see
  // www/index.html for why it still needs to exist.
  webDir: 'www',

  server: {
    // Remote mode: the app is a native shell around the live website, not a
    // bundled copy of it. There is no "build the app's web assets" step —
    // whatever's live on emmerdaleagriculture.com is what the app shows,
    // the moment it's deployed. Entering at /app instead of / skips the
    // marketing homepage: installing the app is a second visit by
    // definition, so there's nothing left to sell — see the /app route's
    // doc comment in the main site repo for the reasoning.
    //
    // IMPORTANT: this only resolves once /app exists in production — see
    // ../0001-add-app-entry-screen.patch and the README's "Getting this
    // live" section. Point this at a Vercel preview URL in the meantime to
    // test against the branch before it's merged.
    url: 'https://emmerdaleagriculture.com/app',
    cleartext: false,
  },

  ios: {
    // Lets the WebView content sit under the status bar / home indicator
    // safe areas the way a native iOS app is expected to, rather than
    // starting flush at the very top edge.
    contentInset: 'automatic',
  },
};

export default config;
