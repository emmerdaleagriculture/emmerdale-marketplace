import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

const SITE = siteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Auth-gated or utility routes — nothing indexable behind these.
      // /start is the paid-ads landing page: noindex by design (spec §1).
      // /quote and /my are token-addressed sealed-quote pages; /invitations
      // and /won are the contractor portal.
      disallow: ['/admin', '/account', '/onboarding', '/jobs', '/api/', '/auth/', '/reset-password', '/start', '/quote', '/my', '/invitations', '/won'],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
