import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { InterestForm } from './InterestForm';
import { countryByCode } from '@/lib/countries';
import { requestCountry } from '@/lib/requestGeo';
import a from '../auth.module.css';

export const metadata: Metadata = {
  title: 'Outside the UK? Tell us where you are',
  description:
    'Emmerdale Agriculture covers the UK today. If you have land work to be done, or do land work, somewhere else, tell us where and we’ll let you know when we open there.',
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

/**
 * Where a visitor from abroad lands: from the /start flow when their location
 * is outside the British Isles, from a postcode that is not a UK postcode on
 * the contractor forms, or from a link. Phase 0 of going worldwide is this
 * page and the counts behind it: before any country is built, the waiting
 * list says which one.
 */
export default async function OutsideTheUkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const side = sp.side === 'contractor' ? 'contractor' : 'customer';
  const from = typeof sp.from === 'string' ? sp.from.slice(0, 120) : '';
  // Preselect the country Vercel saw, when it is one we list. Never the UK:
  // someone here from a UK address is asking about land somewhere else.
  const seen = countryByCode(await requestCountry());
  const country = seen && seen.code !== 'GB' ? seen.code : null;

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <Breadcrumb tone="light" jsonLd={false} skipHome items={[{ label: 'Outside the UK' }]} />
          <div className={a.eyebrow}>Not yet, but soon</div>
          <h1 className={a.title}>
            We only cover the UK <em>for now.</em>
          </h1>
          <p className={a.sub}>
            {side === 'contractor'
              ? 'Every job on the site today is in England, Wales, Scotland or Northern Ireland, so there is nothing here for you to price yet. We are working out where to open next, and the contractors who ask are where we start. Tell us where you are and what you do, and you will hear first, with the first jobs there.'
              : 'Every contractor in our network is in England, Wales, Scotland or Northern Ireland, so we can’t put your job in front of anyone where you are today. We are working out where to open next, and the people who ask are where we start. Tell us where you are and we’ll email you once, when we do.'}
          </p>
          <InterestForm side={side} country={country} sourcePath={from} />
          <p className={a.sub} style={{ marginTop: 24 }}>
            In the UK after all? <Link href="/start">Describe your job</Link> or{' '}
            <Link href="/agriculturalcontractors">join as a contractor</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
