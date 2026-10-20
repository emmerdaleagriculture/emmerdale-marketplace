import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { DirectoryBrowser, type DirectoryMember } from '@/components/directory/DirectoryBrowser';
import { DIRECT_DISCLAIMER, isNationwide } from '@/components/directory/copy';
import { getCountyDirectory, getServices } from '@/lib/reference';
import { jsonLd } from '@/lib/jsonld';
import { siteUrl } from '@/lib/site';
import a from '../auth.module.css';
import s from '@/components/directory/directory.module.css';

// Daily, like the county pages; a member editing their listing clears the
// directory's cache tag and asks for this page to be rebuilt.
export const revalidate = 86400;

const TITLE = 'Find a contractor to contact directly';
const DESCRIPTION =
  'Vetted agricultural contractors across the UK who take enquiries straight from you: who they are, what they do, where they cover, and a form that goes to them alone.';

/** Everyone listed, once each, with everywhere they are listed. Once per
 *  request: the metadata and the body both ask. */
const loadMembers = cache(async (): Promise<{ members: DirectoryMember[]; counties: string[] }> => {
  const [directory, services] = await Promise.all([getCountyDirectory(), getServices()]);
  const serviceName = new Map(services.map((sv) => [sv.id, sv.name]));
  const byId = new Map<string, DirectoryMember>();
  for (const county of Object.keys(directory).sort()) {
    for (const entry of directory[county] ?? []) {
      const m = byId.get(entry.contractorId);
      if (m) m.counties.push(county);
      else
        byId.set(entry.contractorId, {
          entry,
          serviceNames: entry.services.map((id) => serviceName.get(id)).filter(Boolean) as string[],
          counties: [county],
        });
    }
  }
  const members = [...byId.values()].sort((x, y) => x.entry.businessName.localeCompare(y.entry.businessName));
  // The chips: counties someone with bounded coverage is listed in. A
  // nationwide member is under every chip but makes none.
  const counties = [...new Set(members.filter((m) => !isNationwide(m.counties)).flatMap((m) => m.counties))].sort();
  return { members, counties };
});

export async function generateMetadata(): Promise<Metadata> {
  const { members } = await loadMembers();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/contractors' },
    // An empty directory is not a page worth indexing.
    robots: { index: members.length > 0, follow: true },
  };
}

/**
 * The directory's front door: every Open member taking direct enquiries,
 * filtered by county. The county pages carry the same cards for their own
 * county; this is where a visitor who does not know we list anyone finds
 * out, from the header and the footer.
 */
export default async function ContractorsPage() {
  const { members, counties } = await loadMembers();
  const SITE = siteUrl();

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb tone="light" jsonLd={false} skipHome items={[{ label: 'Find a contractor' }]} />
          <div className={a.eyebrow}>Deal direct</div>
          <h1 className={a.title}>
            Find a contractor <em>to contact directly.</em>
          </h1>
          <p className={`${a.sub} ${s.intro}`}>
            Vetted members of our network who take enquiries straight from you. Write to one
            and you agree the work between you, with nothing added on top. Or{' '}
            <Link href="/start">send the job through us</Link> and every contractor covering your
            county can price it.
          </p>

          {members.length === 0 ? (
            <div className={s.empty}>
              Nobody is taking direct enquiries just yet. <Link href="/start">Describe the job</Link>{' '}
              and we’ll put it to the contractors covering your county.
            </div>
          ) : (
            <DirectoryBrowser members={members} counties={counties} />
          )}

          <p className={s.cta}>
            {DIRECT_DISCLAIMER} A contractor who wants to be listed here takes{' '}
            <Link href="/agriculturalcontractors">Open membership</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
      {members.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: TITLE,
              url: `${SITE}/contractors`,
              numberOfItems: members.length,
              itemListElement: members.map((m, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                item: {
                  '@type': 'LocalBusiness',
                  name: m.entry.businessName,
                  ...(m.entry.website ? { url: m.entry.website } : {}),
                  areaServed: isNationwide(m.counties) ? 'United Kingdom' : m.counties,
                },
              })),
            }),
          }}
        />
      )}
    </div>
  );
}
