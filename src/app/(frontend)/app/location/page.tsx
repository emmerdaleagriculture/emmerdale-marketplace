import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail, safeInternalPath } from '@/lib/auth';
import { listSites } from '@/lib/customers/sites';
import { LocationForm } from './LocationForm';
import ui from '../app-ui.module.css';

export const metadata: Metadata = { title: 'Where’s your land?', robots: { index: false, follow: false } };

/**
 * "Where's your land?" (PRD task 6): current location or a postcode, how
 * many approved operators cover it, saved as the customer's first site.
 * Asked once after the phone step; reachable again from Account to add
 * another field or paddock.
 */
export default async function AppLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect('/app');
  if (isAdminEmail(user.email)) redirect('/admin');
  const next = safeInternalPath(sp.next);
  const sites = await listSites(user.id);
  return (
    <main className={ui.screen}>
      <LocationForm next={next} first={sites.length === 0} skipHref={next ?? '/app/continue'} />
    </main>
  );
}
