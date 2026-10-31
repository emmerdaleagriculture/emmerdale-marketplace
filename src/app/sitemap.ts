import type { MetadataRoute } from 'next';
import { allCountyRefs } from '@/lib/verticals';
import { getCountyServiceCoverage, getCountyDirectory } from '@/lib/reference';
import { VERTICALS } from '@/lib/verticals';
import { getNotesData, countByTag } from '@/lib/notes/data';
import { getCostSnapshot } from '@/lib/costPerAcre/load';
import { EMPTY_SNAPSHOT } from '@/lib/costPerAcre/model';
import { CURATED_TAGS, MIN_INDEXED_TAG_POSTS } from '@/lib/notes/tags';
import { siteUrl } from '@/lib/site';
import { SERVICE_PAGES } from '@/lib/services';

const SITE = siteUrl();

// lastmod per page family, bumped in the PR that changes that family's copy
// or template. One site-wide constant used to stamp 305 URLs with the same
// day — including pages created after it — and a crawler that catches a
// lastmod lying once ignores the ones that tell the truth (the notes).
// Pages with no real date are listed without one rather than given a fake.
const DATES = {
  /** Home: coverage copy now names the whole UK (Northern Ireland). */
  home: new Date('2026-10-10'),
  /** Hub titles and descriptions rewritten (SEO review). */
  hubs: new Date('2026-10-11'),
  /** Paddock county pages: the Open members' directory added. */
  paddockCounty: new Date('2026-10-21'),
  /** Hay and tractor county pages: the Open members' directory added. */
  verticalCounty: new Date('2026-10-21'),
  /** Contractor recruiting page: title and description trimmed. */
  contractors: new Date('2026-10-11'),
  /** Service pages: muck spreading and muck heap removal added (2026-10-21). */
  services: new Date('2026-10-21'),
  /** Customer terms v2.1 and the charter (insurance wording). */
  legal: new Date('2026-09-23'),
  /** The directory of Open members taking direct enquiries. */
  directory: new Date('2026-10-21'),
} as const;

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
  const [counties, hayCoverage, tractorCoverage, notes, directory, costSnapshot] = await Promise.all([
    allCountyRefs(),
    getCountyServiceCoverage(VERTICALS['hay-bales'].serviceId),
    getCountyServiceCoverage(VERTICALS['tractor-hire'].serviceId),
    getNotesData(),
    getCountyDirectory(),
    // The page itself should fail loudly if its table is unreadable; the
    // sitemap should not lose 300 URLs over one. Left out instead.
    getCostSnapshot().catch(() => EMPTY_SNAPSHOT),
  ]);
  // The cost-per-acre page is noindex until its first snapshot has figures;
  // after that its lastmod is the snapshot's date, which is when it changed.
  const costPages: MetadataRoute.Sitemap =
    costSnapshot.uk.length > 0
      ? [
          {
            url: `${SITE}/cost-per-acre`,
            lastModified: costSnapshot.computedAt ? new Date(costSnapshot.computedAt) : undefined,
            changeFrequency: 'monthly' as const,
            priority: 0.8,
          },
        ]
      : [];
  // The directory is noindex while nobody is listed, so it is not submitted then either.
  const directoryListed = Object.values(directory).some((entries) => entries.length > 0);
  // Only list hay/tractor county pages a contractor of THAT service covers —
  // the same per-service rule as the page's own robots meta, so we never
  // submit a page that is noindex, or a tractor-hire page whose only
  // "coverage" is a straw supplier.
  const countyPages: MetadataRoute.Sitemap = [
    ...counties
      .filter((c) => (hayCoverage[c.name] ?? 0) > 0)
      .map((c) => ({ url: `${SITE}/hay-bales/${c.slug}`, lastModified: DATES.verticalCounty, changeFrequency: 'monthly' as const, priority: 0.6 })),
    ...counties
      .filter((c) => (tractorCoverage[c.name] ?? 0) > 0)
      .map((c) => ({ url: `${SITE}/tractor-hire/${c.slug}`, lastModified: DATES.verticalCounty, changeFrequency: 'monthly' as const, priority: 0.5 })),
  ];

  // Paddock county pages list every county, covered or not — see the indexing
  // note on the page itself. A job in an uncovered county still has somewhere
  // to go, and that demand is what recruits contractors into the area.
  // One page per service, plus their index (SEO review, 2026-09-24).
  const servicePages: MetadataRoute.Sitemap = [
    { url: `${SITE}/services`, lastModified: DATES.services, changeFrequency: 'monthly', priority: 0.8 },
    ...(directoryListed
      ? [{ url: `${SITE}/contractors`, lastModified: DATES.directory, changeFrequency: 'weekly' as const, priority: 0.7 }]
      : []),
    ...SERVICE_PAGES.map((p) => ({
      url: `${SITE}/services/${p.path}`,
      lastModified: DATES.services,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];

  const paddockCountyPages: MetadataRoute.Sitemap = counties.map((c) => ({
    url: `${SITE}/paddock-maintenance/${c.slug}`,
    lastModified: DATES.paddockCounty,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // Notes: index + every published post + non-empty tag hubs (same gating as
  // the hub pages themselves, which 404 while empty).
  const allNotes = [...(notes.featured ? [notes.featured] : []), ...notes.grid];
  const tagCounts = countByTag(allNotes);
  // A post's lastmod is its publish date or its last edit, whichever is later;
  // a hub's is the newest of the posts on it, which is what changed the page.
  const noteDate = (n: { publishedAt: string | null; updatedAt: string | null }) =>
    latestDate([n.publishedAt, n.updatedAt]);
  const newestOverall = latestDate(allNotes.flatMap((n) => [n.publishedAt, n.updatedAt]));
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
            lastModified: noteDate(n),
            changeFrequency: 'monthly' as const,
            priority: 0.6,
          })),
          // Only hubs with enough posts to be more than a copy of them — the
          // same threshold that keeps the rest noindex.
          ...CURATED_TAGS.filter((t) => (tagCounts.get(t.slug) ?? 0) >= MIN_INDEXED_TAG_POSTS).map((t) => ({
            url: `${SITE}/notes/tag/${t.slug}`,
            lastModified: latestDate(
              allNotes.filter((n) => n.tags.includes(t.slug)).flatMap((n) => [n.publishedAt, n.updatedAt]),
            ),
            changeFrequency: 'monthly' as const,
            priority: 0.5,
          })),
        ];

  return [
    { url: SITE, lastModified: DATES.home, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/paddock-maintenance`, lastModified: DATES.hubs, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/hay-bales`, lastModified: DATES.hubs, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/tractor-hire`, lastModified: DATES.hubs, changeFrequency: 'monthly', priority: 0.7 },
    // The supply side: the argument page, then the form it feeds.
    { url: `${SITE}/agriculturalcontractors`, lastModified: DATES.contractors, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/signup`, lastModified: DATES.contractors, changeFrequency: 'monthly', priority: 0.9 },
    // No honest date for these: listed without one.
    { url: `${SITE}/contact`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/terms`, lastModified: DATES.legal, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/customer-terms`, lastModified: DATES.legal, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/service-charter`, lastModified: DATES.legal, changeFrequency: 'yearly', priority: 0.2 },
    ...servicePages,
    ...costPages,
    ...paddockCountyPages,
    ...countyPages,
    ...notePages,
  ];
}
