import { RatingStars } from '@/components/RatingStars';
import { getCountyDirectory, getServices } from '@/lib/reference';
import { DirectEnquiryForm } from './DirectEnquiryForm';
import l from '@/app/(frontend)/landing.module.css';
import s from './directory.module.css';

/** A website as typed on the dashboard, shown as its host. */
function siteHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * The Open members covering a county, on its public page: name, rating,
 * their line about themselves, the services they offer, their website and
 * a button that writes to them alone. Rendered as nothing when nobody is
 * listed, so a county with no Open member reads as it did. `serviceId`
 * narrows the list to members offering that service (the hay and tractor
 * hire pages); the paddock page shows everyone.
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
          {entries.map((e) => {
            const names = e.services.map((id) => serviceName.get(id)).filter(Boolean) as string[];
            return (
              <article key={e.contractorId} className={s.card} aria-label={e.businessName}>
                <div className={s.head}>
                  <h3 className={s.name}>{e.businessName}</h3>
                  <RatingStars avg={e.ratingAvg} count={e.ratingCount} />
                </div>
                {e.blurb && <p className={s.blurb}>{e.blurb}</p>}
                {names.length > 0 && (
                  <p className={s.services}>
                    {names.slice(0, 6).join(' · ')}
                    {names.length > 6 ? ` · and ${names.length - 6} more` : ''}
                  </p>
                )}
                <div className={s.links}>
                  {e.website && (
                    <a className={s.site} href={e.website} target="_blank" rel="noopener">
                      {siteHost(e.website)} ↗
                    </a>
                  )}
                  <DirectEnquiryForm contractorId={e.contractorId} businessName={e.businessName} county={county} />
                </div>
              </article>
            );
          })}
        </div>
        <p className={s.fine}>
          Work agreed directly with a contractor is between you and them: our deposit, cover and
          payment protection apply only to jobs priced through us.
        </p>
      </div>
    </section>
  );
}
