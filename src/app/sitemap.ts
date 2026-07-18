import type { MetadataRoute } from 'next';
import { allCountyRefs } from '@/lib/verticals';
import { getCountyCoverage } from '@/lib/reference';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://emmerdaleagriculture.com';

// Bumped when the indexable pages get a meaningful content change, so crawlers
// get a stable lastmod signal rather than a churning per-build timestamp.
const LAST_UPDATED = new Date('2026-07-18');

// Refresh daily so covered-county entries track the network as it grows.
export const revalidate = 86400;

// Public, indexable pages only. Job pages are auth-gated so they stay out, and
// login is noindex (no search value), so it's excluded here too. The homepage
// uses the bare origin (no trailing slash) to match its rendered canonical.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [counties, coverage] = await Promise.all([allCountyRefs(), getCountyCoverage()]);
  // Only list county pages we actually cover — matches the per-page index rule,
  // so we never submit thin, no-coverage pages to Google.
  const countyPages: MetadataRoute.Sitemap = counties
    .filter((c) => (coverage[c.name] ?? 0) > 0)
    .flatMap((c) => [
      { url: `${SITE}/hay-bales/${c.slug}`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.6 },
      { url: `${SITE}/tractor-hire/${c.slug}`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.5 },
    ]);

  return [
    { url: SITE, lastModified: LAST_UPDATED, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/hay-bales`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/tractor-hire`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE}/signup`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/privacy`, lastModified: LAST_UPDATED, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/terms`, lastModified: LAST_UPDATED, changeFrequency: 'yearly', priority: 0.2 },
    ...countyPages,
  ];
}
