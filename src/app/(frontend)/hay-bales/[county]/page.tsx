import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CountyVerticalPage } from '@/components/verticals/CountyVerticalPage';
import { allCountyRefs, resolveCountyBySlug, VERTICALS } from '@/lib/verticals';
import { getCountyServiceCoverage } from '@/lib/reference';

export const dynamicParams = false;
// A month, not a day. Hundreds of county pages each see under a visit a day,
// so a daily expiry meant most visitors waited for a fresh render (~750ms,
// measured 2026-10-30). Coverage changes — a contractor approved, suspended,
// deleted, or editing their counties — rebuild every county page through
// revalidateDirectory(), so the long window costs nothing in freshness.
export const revalidate = 2592000;

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
  const v = VERTICALS['hay-bales'];
  const coverage = (await getCountyServiceCoverage(v.serviceId))[resolved.county.name] ?? 0;
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
  const coverage = (await getCountyServiceCoverage(VERTICALS['hay-bales'].serviceId))[resolved.county.name] ?? 0;
  return (
    <CountyVerticalPage
      vertical="hay-bales"
      county={resolved.county}
      siblings={resolved.siblings}
      coverage={coverage}
    />
  );
}
