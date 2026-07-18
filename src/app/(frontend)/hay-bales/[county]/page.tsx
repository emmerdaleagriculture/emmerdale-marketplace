import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CountyVerticalPage } from '@/components/verticals/CountyVerticalPage';
import { allCountyRefs, resolveCountyBySlug, VERTICALS } from '@/lib/verticals';
import { getCountyCoverage } from '@/lib/reference';

export const dynamicParams = false;
// Refresh daily so coverage counts (and the index/noindex decision below) stay
// current as contractors join, without a manual redeploy.
export const revalidate = 86400;

export async function generateStaticParams() {
  const refs = await allCountyRefs();
  return refs.map((c) => ({ county: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ county: string }>;
}): Promise<Metadata> {
  const { county } = await params;
  const resolved = await resolveCountyBySlug(county);
  if (!resolved) return {};
  const coverage = (await getCountyCoverage())[resolved.county.name] ?? 0;
  const v = VERTICALS['hay-bales'];
  return {
    title: v.metaTitle(resolved.county.name),
    description: v.metaDescription(resolved.county.name),
    alternates: { canonical: `/hay-bales/${county}` },
    // Only ask Google to index counties we actually cover — keeps thin,
    // no-coverage pages out of the index while still capturing enquiries.
    robots: { index: coverage > 0, follow: true },
  };
}

export default async function HayBalesCountyPage({
  params,
}: {
  params: Promise<{ county: string }>;
}) {
  const { county } = await params;
  const resolved = await resolveCountyBySlug(county);
  if (!resolved) notFound();
  const coverage = (await getCountyCoverage())[resolved.county.name] ?? 0;
  return (
    <CountyVerticalPage
      vertical="hay-bales"
      county={resolved.county}
      siblings={resolved.siblings}
      coverage={coverage}
    />
  );
}
