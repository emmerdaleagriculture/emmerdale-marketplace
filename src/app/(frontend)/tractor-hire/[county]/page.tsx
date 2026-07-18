import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CountyVerticalPage } from '@/components/verticals/CountyVerticalPage';
import { allCountyRefs, resolveCountyBySlug, VERTICALS } from '@/lib/verticals';

export const dynamicParams = false;

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
  const v = VERTICALS['tractor-hire'];
  return {
    title: v.metaTitle(resolved.county.name),
    description: v.metaDescription(resolved.county.name),
    alternates: { canonical: `/tractor-hire/${county}` },
  };
}

export default async function TractorHireCountyPage({
  params,
}: {
  params: Promise<{ county: string }>;
}) {
  const { county } = await params;
  const resolved = await resolveCountyBySlug(county);
  if (!resolved) notFound();
  return (
    <CountyVerticalPage vertical="tractor-hire" county={resolved.county} siblings={resolved.siblings} />
  );
}
