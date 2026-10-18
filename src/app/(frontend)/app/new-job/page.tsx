import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { listSites } from '@/lib/customers/sites';
import { getCounties, getCountyCoverage } from '@/lib/reference';
import { HOME_SERVICES } from '@/lib/home/services';
import { NewJobFlow, type FlowSite } from './NewJobFlow';

export const metadata: Metadata = { title: 'Get prices', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The app's job flow (PRD task 8): one question per screen — what, the
 * land, photos, check and send — posting to the same intake as /start
 * (parseJobAction then confirmJobAction) with the app recorded as the
 * landing path. The customer's saved sites and verified details fill in
 * what /start has to ask for.
 */
export default async function AppNewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect('/app');
  if (isAdminEmail(user.email)) redirect('/admin');

  const admin = createServiceRoleClient();
  const [{ data: customer }, sites] = await Promise.all([
    admin.from('customers').select('contact_name, phone').eq('id', user.id).maybeSingle(),
    listSites(user.id),
  ]);
  if (!customer) redirect('/app/role');

  // Coverage for each site from its stored county: no geocoding on the way in.
  const [counties, coverage] = await Promise.all([getCounties(), getCountyCoverage()]);
  const countyName = new Map(counties.map((c) => [c.id, c.name]));
  const flowSites: FlowSite[] = sites.map((s) => {
    const county = s.countyId != null ? countyName.get(s.countyId) ?? null : null;
    return { id: s.id, label: s.label, postcode: s.postcode, acres: s.acres, lat: s.lat, lng: s.lng, countyId: s.countyId, operators: county ? coverage[county] ?? 0 : null, county };
  });

  const preset = HOME_SERVICES.some((c) => c.slug === sp.service) ? sp.service! : null;

  return (
    <NewJobFlow
      sites={flowSites}
      contact={{ name: customer.contact_name ?? '', email: user.email ?? '', phone: customer.phone ?? '' }}
      services={HOME_SERVICES.map((c) => ({ slug: c.slug, name: c.name }))}
      presetService={preset}
    />
  );
}
