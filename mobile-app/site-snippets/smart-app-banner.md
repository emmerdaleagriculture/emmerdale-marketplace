# Apple Smart App Banner

One meta tag. On iPhone Safari it shows Apple's own native banner at the top
of the page offering to install the app — or to open it, if it's already
installed. It does nothing on Android or desktop, and nothing at all until the
app is live, so it's safe to add early.

Add to `src/app/(frontend)/layout.tsx`, inside the existing `metadata` export:

```ts
export const metadata: Metadata = {
  // ...everything already there...
  appleItunesApp: {
    appId: 'REPLACE_WITH_NUMERIC_APP_ID',   // App Store Connect > App Information > Apple ID
    appArgument: siteUrl(),                  // opens the app on the page the visitor was reading
  },
};
```

Next.js renders this as `<meta name="apple-itunes-app" content="app-id=...">`.
The app ID is a number (like 6472019283), not the bundle ID.
