import Link from 'next/link';
import { getCountyDirectory, getServices } from '@/lib/reference';
import { DirectoryCard } from './DirectoryCard';
import l from '@/app/(frontend)/landing.module.css';
import s from './directory.module.css';

/**
 * The Open members covering a county, on its public page: name, rating,
 * their line about themselves, the services they offer, their website and
 * a button that writes to them alone. Rendered as nothing when nobody is
 * listed, so a county with no Open member reads as it did. `serviceId`
 * narrows the list to members offering that service (the hay and tractor
 * hire pages); the paddock page shows everyone who takes general work.
 */
export async function CountyDirectory({ county, serviceId }: { county: string; serviceId?: number }) {
  const [directory, services] = await Promise.all([getCountyDirectory(), getServices()]);
  // Without a service (the paddock page) a supplier who takes no general
  // work is left out, as the coverage count leaves them out; with one, the
  // list is whoever offers it, supplier or not.
  const entries = (directory[county] ?? []).filter((e) =>
    serviceId == null ? !e.servicesOnly : e.services.includes(serviceId),
  );
  if (entries.length === 0) return null;
  const serviceName = new Map(services.map((sv) => [sv.id, sv.name]));
  const names = (ids: number[]) => ids.map((id) => serviceName.get(id)).filter(Boolean) as string[];

  return (
    <section className={`${l.section} ${l.sectionAlt}`}>
      <div className={l.sectionInner}>
        <div className={l.kicker}>Deal direct</div>
        <h2 className={l.sectionTitle}>
          Contractors you can contact directly <em>in {county}.</em>
        </h2>
        <p className={l.sectionLede}>
          Vetted members of our network who take enquiries straight from you. Write to one and
          you agree the work between you; send the job through the form above and every
          contractor covering {county} can price it.
        </p>
        <div className={s.list}>
          {entries.map((e) => (
            <DirectoryCard key={e.contractorId} entry={e} serviceNames={names(e.services)} county={county} />
          ))}
        </div>
        <p className={s.fine}>
          Work agreed directly with a contractor is between you and them: our deposit, cover and
          payment protection apply only to jobs priced through us.{' '}
          <Link href="/contractors">See everyone taking direct enquiries →</Link>
        </p>
      </div>
    </section>
  );
}
