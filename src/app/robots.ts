import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://emmerdaleagriculture.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Auth-gated or utility routes — nothing indexable behind these.
      disallow: ['/admin', '/account', '/jobs', '/api/', '/auth/', '/reset-password'],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
