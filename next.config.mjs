import { fileURLToPath } from 'url';
// From '@sentry/nextjs/config', not '@sentry/nextjs' — the latter is
// deprecated on v10 and stops working in v11.
import { withSentryConfig } from '@sentry/nextjs/config';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin file-tracing to this project. Without it, a stray lockfile in a parent
  // directory makes Next infer the wrong workspace root.
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),

  // React 19 strict mode — catches accidental side-effects
  reactStrictMode: true,

  /**
   * Vercel's skew protection tags every asset URL in the HTML with the
   * deployment (`?dpl=…`), font preloads included, but the `url()` inside the
   * built CSS has no tag — so the browser fetched each preloaded font twice,
   * once per URL (46KB and two requests on every first visit, measured
   * 2026-10-20). This gives the CSS the same tag, so the preload and the
   * stylesheet agree. NEXT_DEPLOYMENT_ID is set by Vercel's build when skew
   * protection is on and absent otherwise, so locally this does nothing.
   */
  webpack(config, { dev, webpack }) {
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
    // Notes hero/inline images live in the public notes-media bucket.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
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
