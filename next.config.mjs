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
