import { fileURLToPath } from 'url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin file-tracing to this project. Without it, a stray lockfile in a parent
  // directory makes Next infer the wrong workspace root.
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),

  // React 19 strict mode — catches accidental side-effects
  reactStrictMode: true,

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
    // Notes hero/inline images live in the public notes-media bucket.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
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

export default nextConfig;
