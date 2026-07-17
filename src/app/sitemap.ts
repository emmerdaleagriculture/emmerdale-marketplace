import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://emmerdaleagriculture.com';

// Bumped when the indexable pages get a meaningful content change, so crawlers
// get a stable lastmod signal rather than a churning per-build timestamp.
const LAST_UPDATED = new Date('2026-07-17');

// Public, indexable pages only. Job pages are auth-gated so they stay out, and
// login is noindex (no search value), so it's excluded here too. The homepage
// uses the bare origin (no trailing slash) to match its rendered canonical.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, lastModified: LAST_UPDATED, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/signup`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/privacy`, lastModified: LAST_UPDATED, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/terms`, lastModified: LAST_UPDATED, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
