# App icon & splash screen source images

Both files are already here, generated from the site's own real brand
mark (`src/app/icon.svg` in the main repo — not a placeholder):

- `icon-store-square.png` — 1024×1024, square corners, no transparency.
  This is the one to submit to both stores. (Both stores apply their own
  corner mask, so a pre-rounded icon gets rejected or double-rounded —
  this version has the SVG's built-in `rx="12"` rounding stripped out.)
- `icon.png` — the same mark at 1024×1024 but with the SVG's rounded
  corners left in, kept only as a reference; don't submit this one.
- `splash.png` — 2732×2732, the mark centered on the site's dark green
  (`#17330d`) background with plenty of clear space around it.

If the brand mark ever changes, regenerate both from the updated
`icon.svg` (any SVG-to-PNG tool at the sizes above, with corner-rounding
stripped for the store icon) — otherwise these are ready to use as-is.

To generate the full set of platform-specific sizes from these two
source files, run:

```bash
npx @capacitor/assets generate --iconBackgroundColor '#17330d' --splashBackgroundColor '#17330d'
```

(`#17330d` is the real `--jd-green-deep` value taken from the main site's
own CSS.) This generates every required icon and splash size for both iOS
and Android automatically into the native projects created by
`npm run add:ios` / `add:android`, using `icon-store-square.png` and
`splash.png` above as the source.
