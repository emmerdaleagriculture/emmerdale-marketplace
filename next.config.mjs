import { fileURLToPath } from 'url';
// From '@sentry/nextjs/config', not '@sentry/nextjs' — the latter is
// deprecated on v10 and stops working in v11.
import { withSentryConfig } from '@sentry/nextjs/config';

/** Our Supabase host, for the image optimiser's allow-list. */
const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname || 'wiipzjpqztqjtczeuodp.supabase.co';
  } catch {
    return 'wiipzjpqztqjtczeuodp.supabase.co';
  }
})();

/**
 * Turbopack runs no webpack loaders and does not say so: the webpack() hook
 * below is never called, and React's dropped ping comes back with no error
 * anywhere (webpack/reactRenderPhasePing.cjs has the story). Next sets
 * TURBOPACK before it reads this file, so a Turbopack build stops here and
 * `npm run dev:turbo` starts with the warning.
 */
if (process.env.TURBOPACK) {
  const message =
    'Turbopack does not run webpack/reactRenderPhasePing.cjs, so React drops pings mid-render again and a click ' +
    'inside a section with a loading.tsx can do nothing. Use webpack (`npm run dev`, `npm run build`), or read ' +
    'the comment at the top of that loader first.';
  if (process.env.NODE_ENV !== 'development') throw new Error(message);
  console.warn(`\n ⚠ ${message}\n`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin file-tracing to this project. Without it, a stray lockfile in a parent
  // directory makes Next infer the wrong workspace root.
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),

  /**
   * Invoice PDFs (@react-pdf/renderer → pdfkit) load pdfkit's built-in fonts
   * through the package's "#standard-fonts/…" import map, which file tracing
   * can't follow, so the deployed functions shipped without them and every
   * PDF threw "Cannot find module …/pdfkit/js/standard-fonts/Helvetica.cjs"
   * (2026-11-19). Ship them with every route that renders or emails one.
   */
  outputFileTracingIncludes: {
    '/account/books/**': ['./node_modules/pdfkit/js/standard-fonts/**', './node_modules/pdfkit/js/data/**'],
    '/i/**': ['./node_modules/pdfkit/js/standard-fonts/**', './node_modules/pdfkit/js/data/**'],
    // The heartbeat renders a sample invoice to prove the fonts are deployed.
    '/api/cron/heartbeat': ['./node_modules/pdfkit/js/standard-fonts/**', './node_modules/pdfkit/js/data/**'],
    '/admin/errors': ['./node_modules/pdfkit/js/standard-fonts/**', './node_modules/pdfkit/js/data/**'],
  },

  // React 19 strict mode — catches accidental side-effects
  reactStrictMode: true,

  /**
   * Two changes to the build, each explained where it is made: React's
   * dropped ping is corrected in the copy Next bundles (in every build, local
   * ones included), and on Vercel the fonts in the CSS get the deployment tag.
   */
  webpack(config, { dev, isServer, webpack }) {
    // The React that Next bundles throws away a "data has arrived" ping that
    // fires mid-render, which left clicks inside a section with a loading.tsx
    // doing nothing (37 in 120, 2026-11-26). The loader makes React's own
    // one-line correction as that file is compiled, and stops the build if a
    // Next upgrade has changed the line. The whole story is at the top of it.
    config.module.rules.push({
      test: /[\\/]next[\\/]dist[\\/]compiled[\\/]react-dom(?:-experimental)?[\\/]cjs[\\/]react-dom-(?:client\.(?:production|development)|profiling\.profiling)\.js$/,
      loader: fileURLToPath(new URL('./webpack/reactRenderPhasePing.cjs', import.meta.url)),
    });
    // The loader can only object to a file that reaches it. If no bundled
    // react-dom-client went through it at all (Next has moved its React, or
    // the rule above no longer matches), the browser build fails here instead
    // of quietly shipping the fault back. One patched copy is enough to pass.
    // The Pages Router's own React (node_modules/react-dom, in the
    // framework-*.js chunk) is not patched: this site has no Pages routes.
    if (!dev && !isServer) {
      config.plugins.push({
        apply(compiler) {
          compiler.hooks.thisCompilation.tap('ReactRenderPhasePing', (compilation) => {
            compilation.hooks.finishModules.tap('ReactRenderPhasePing', (modules) => {
              for (const m of modules) {
                if (m.loaders?.some((l) => String(l.loader).endsWith('reactRenderPhasePing.cjs'))) return;
              }
              compilation.errors.push(
                new webpack.WebpackError(
                  'reactRenderPhasePing: no bundled react-dom-client went through webpack/reactRenderPhasePing.cjs, ' +
                    'so the dead-click fix is not in this build. Either Next has moved its React (see the comment ' +
                    'at the top of that loader), or the loader was removed on purpose and this plugin should go too.',
                ),
              );
            });
          });
        },
      });
    }

    // Vercel's skew protection tags every asset URL in the HTML with the
    // deployment (`?dpl=…`), font preloads included, but the `url()` inside the
    // built CSS has no tag — so the browser fetched each preloaded font twice,
    // once per URL (46KB and two requests on every first visit, measured
    // 2026-10-20). This gives the CSS the same tag, so the preload and the
    // stylesheet agree. NEXT_DEPLOYMENT_ID is set by Vercel's build when skew
    // protection is on and absent otherwise, so locally this part does nothing.
    const dpl = process.env.NEXT_DEPLOYMENT_ID;
    if (!dev && dpl) {
      const { Compilation, sources } = webpack;
      config.plugins.push({
        apply(compiler) {
          compiler.hooks.thisCompilation.tap('FontDeploymentTag', (compilation) => {
            compilation.hooks.processAssets.tap(
              { name: 'FontDeploymentTag', stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
              (assets) => {
                for (const name of Object.keys(assets)) {
                  if (!name.endsWith('.css')) continue;
                  const src = assets[name].source().toString();
                  const out = src.replace(
                    /(\/_next\/static\/media\/[^)'"?\s]+\.(?:woff2?|ttf|otf|eot))(?=[)'"])/g,
                    `$1?dpl=${dpl}`,
                  );
                  if (out !== src) compilation.updateAsset(name, new sources.RawSource(out));
                }
              },
            );
          });
        },
      });
    }
    return config;
  },

  experimental: {
    serverActions: {
      // /start step 1 posts photos (client-downscaled ~0.5MB each) through a
      // server action; the 1MB default would reject them.
      bodySizeLimit: '8mb',
    },
  },

  images: {
    // Modern formats — Next serves AVIF/WebP to browsers that support them
    formats: ['image/avif', 'image/webp'],
    // Files in /public carry max-age=0, so without this the optimiser
    // re-transforms every size and format a minute after the last request.
    // The photos are content-stable; a changed one gets a new name.
    minimumCacheTTL: 2592000,
    // The optimiser is billed per source image and per transformation, and
    // anyone can call /_next/image with any URL these patterns allow. Until
    // 2026-11-08 this was `*.supabase.co` — every public bucket of every
    // Supabase project, so a stranger could host images on their own free
    // project and have us resize them. Note heroes (noteHeroUrl) are the only
    // remote images, so: our project, the notes-media bucket, nothing else.
    // The host follows NEXT_PUBLIC_SUPABASE_URL, as noteHeroUrl does, so a
    // project move or a local stack doesn't silently break every hero.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: SUPABASE_HOST,
        pathname: '/storage/v1/object/public/notes-media/**',
      },
    ],
    // Without a list, any q=1..100 is accepted and each is a separate
    // transformation. These are the qualities the code uses (75 = default);
    // add one here before using a new `quality` prop — unlisted, it throws in
    // dev and 400s in production. Keep it sorted (Next sorts it in place).
    qualities: [60, 65, 70, 75],
  },

  // The app-link files (PRD task 10) are route handlers, so the team id and
  // the Android fingerprint can come from the environment; Apple's must be
  // served at this exact path with no extension.
  async rewrites() {
    return [
      { source: '/.well-known/apple-app-site-association', destination: '/api/well-known/aasa' },
      { source: '/.well-known/assetlinks.json', destination: '/api/well-known/assetlinks' },
    ];
  },

  async redirects() {
    return [
      // Short direct store links. Emails and texts now carry /apps (the
      // (frontend)/apps page picks the store by device); these stay for
      // links already sent. Temporary, so the target can change.
      {
        source: '/iphone',
        destination: 'https://apps.apple.com/gb/app/emmerdale-agriculture/id6824264882',
        permanent: false,
      },
      {
        source: '/android',
        destination: 'https://play.google.com/store/apps/details?id=com.emmerdaleagriculture.app',
        permanent: false,
      },
      // iOS, mail clients and bookmark fetchers probe /apple-touch-icon.png
      // and its -precomposed and -120x120 variants without reading the page's
      // <link rel="apple-touch-icon">. The plain name is a file in /public;
      // every variant lands on it here, at the edge, instead of running the
      // 404 page as a function (~450 times a week, measured 2026-10-30).
      {
        source: '/apple-touch-icon-:variant.png',
        destination: '/apple-touch-icon.png',
        permanent: true,
      },
      // The two imported notes shipped with slugs hard-truncated at 80 chars,
      // mid-word. Renamed to readable, keyword-bearing URLs; these keep the
      // originals alive for anything already shared.
      //
      // The rename itself is a data change — the notes.slug rows were updated
      // in Supabase on 2026-09-01, so it leaves no trace in the repo. Both
      // destinations below resolve today; if you ever restore an older
      // snapshot of the notes table, these redirects go to 404 until it's
      // re-applied.
      {
        source:
          '/notes/need-paddock-work-done-emmerdale-agriculture-can-help-you-find-a-contractor-anyw',
        destination: '/notes/find-a-paddock-contractor-anywhere-in-the-uk',
        permanent: true,
      },
      {
        source:
          '/notes/agricultural-contractor-looking-for-more-work-join-the-emmerdale-agriculture-con',
        destination: '/notes/agricultural-contractor-looking-for-more-work',
        permanent: true,
      },
      // The customer terms and service charter were PDFs until 2026-09-10 and
      // are linked from every job page and payment email sent before then.
      // Their v1.0 described 100%-up-front payment, which the site no longer
      // does; the pages carry v2.0, and the old URLs land on them.
      {
        source: '/legal/customer-terms-and-conditions.pdf',
        destination: '/customer-terms',
        permanent: true,
      },
      {
        source: '/legal/customer-service-charter.pdf',
        destination: '/service-charter',
        permanent: true,
      },
    ];
  },

  // Security headers applied to every response
  async headers() {
    return [
      {
        // Next's content-hashed build assets are immutable — cache them hard
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // geolocation=(self): /start's "use my location" button needs the
            // browser geolocation API (spec §4 step 1).
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: 'emmerdale-agriculture-ltd',
  project: 'javascript-nextjs',

  // Build-time only, and the one genuine secret in this setup — unlike the
  // DSN. Absent locally, which is fine: source maps simply are not uploaded.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Without this, a production stack trace is minified nonsense.
  widenClientFileUpload: true,

  // Sentry's own domain is on every ad-blocker list, and a good share of this
  // site's traffic is people who browse with one. Events go to this path on
  // our own domain instead, which is also why middleware.ts has to let it
  // past — see the matcher there.
  tunnelRoute: '/monitoring',

  // No browser performance tracing: nobody reads client spans, and the
  // integration is 20–30 KB gzipped on every page, including the paid
  // /start landing where most arrivals are on phones. Server tracing is
  // unaffected (sentry.server.config / instrumentation.ts).
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },

  silent: !process.env.CI,
});
