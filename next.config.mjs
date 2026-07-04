import { fileURLToPath } from 'url';
import { withPayload } from '@payloadcms/next/withPayload';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin file-tracing to this project. Without it, a stray lockfile in a parent
  // directory makes Next infer the wrong workspace root.
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),

  // React 19 strict mode — catches accidental side-effects
  reactStrictMode: true,

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
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },

  experimental: {
    // Required for Payload
    reactCompiler: false,
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
