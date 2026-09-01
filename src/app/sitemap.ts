import type { MetadataRoute } from 'next';
import { allCountyRefs } from '@/lib/verticals';
import { getCountyCoverage } from '@/lib/reference';
import { getNotesData, countByTag } from '@/lib/notes/data';
import { CURATED_TAGS } from '@/lib/notes/tags';
import { siteUrl } from '@/lib/site';

const SITE = siteUrl();

// Bumped when the indexable pages get a meaningful content change, so crawlers
// get a stable lastmod signal rather than a churning per-build timestamp.
const LAST_UPDATED = new Date('2026-09-01');

// Refresh daily so covered-county entries track the network as it grows.
export const revalidate = 86400;

/** Most recent of a set of ISO dates, or undefined if there are none. */
function latestDate(dates: (string | null)[]): Date | undefined {
  const times = dates
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.max(...times)) : undefined;
}

// Public, indexable pages only. Job pages are auth-gated so they stay out, and
// login is noindex (no search value), so it's excluded here too. The homepage
// uses the bare origin (no trailing slash) to match its rendered canonical.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [counties, coverage, notes] = await Promise.all([
    allCountyRefs(),
    getCountyCoverage(),
    getNotesData(),
  ]);
  // Only list hay/tractor county pages we actually cover — matches the per-page
  // index rule, so we never submit thin, no-coverage pages to Google.
  const countyPages: MetadataRoute.Sitemap = counties
    .filter((c) => (coverage[c.name] ?? 0) > 0)
    .flatMap((c) => [
      { url: `${SITE}/hay-bales/${c.slug}`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.6 },
      { url: `${SITE}/tractor-hire/${c.slug}`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.5 },
    ]);

  // Paddock county pages list every county, covered or not — see the indexing
  // note on the page itself. A job in an uncovered county still has somewhere
  // to go, and that demand is what recruits contractors into the area.
  const paddockCountyPages: MetadataRoute.Sitemap = counties.map((c) => ({
    url: `${SITE}/paddock-maintenance/${c.slug}`,
    lastModified: LAST_UPDATED,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // Notes: index + every published post + non-empty tag hubs (same gating as
  // the hub pages themselves, which 404 while empty).
  const allNotes = [...(notes.featured ? [notes.featured] : []), ...notes.grid];
  const tagCounts = countByTag(allNotes);
  // Newest publish date per tag (and overall) — a hub's lastmod is the date of
  // the most recent post on it, which is what actually changed the page.
  const newestOverall = latestDate(allNotes.map((n) => n.publishedAt));
  const notePages: MetadataRoute.Sitemap =
    allNotes.length === 0
      ? []
      : [
          {
            url: `${SITE}/notes`,
            lastModified: newestOverall,
            changeFrequency: 'weekly' as const,
            priority: 0.7,
          },
          ...allNotes.map((n) => ({
            url: `${SITE}/notes/${n.slug}`,
            lastModified: n.publishedAt ? new Date(n.publishedAt) : undefined,
            changeFrequency: 'monthly' as const,
            priority: 0.6,
          })),
          ...CURATED_TAGS.filter((t) => (tagCounts.get(t.slug) ?? 0) > 0).map((t) => ({
            url: `${SITE}/notes/tag/${t.slug}`,
            lastModified: latestDate(
              allNotes.filter((n) => n.tags.includes(t.slug)).map((n) => n.publishedAt),
            ),
            changeFrequency: 'monthly' as const,
            priority: 0.5,
          })),
        ];

  return [
    { url: SITE, lastModified: LAST_UPDATED, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/paddock-maintenance`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/hay-bales`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/tractor-hire`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE}/signup`, lastModified: LAST_UPDATED, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/privacy`, lastModified: LAST_UPDATED, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/terms`, lastModified: LAST_UPDATED, changeFrequency: 'yearly', priority: 0.2 },
    ...paddockCountyPages,
    ...countyPages,
    ...notePages,
  ];
}
