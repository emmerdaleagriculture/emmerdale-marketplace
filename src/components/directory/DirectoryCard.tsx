import { RatingStars } from '@/components/RatingStars';
import { DirectEnquiryForm } from './DirectEnquiryForm';
import type { DirectoryEntry } from '@/lib/reference';
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
 * One Open member's card: name, rating, their line about themselves, the
 * services they offer (by name), where they cover when the page is not
 * itself a county's, their website and the button that writes to them
 * alone. Shared by a county page's section and the directory page, and
 * kept free of server imports so the directory's county filter can render
 * it on the client.
 */
export function DirectoryCard({
  entry,
  serviceNames,
  county,
  counties,
}: {
  entry: DirectoryEntry;
  serviceNames: string[];
  /** The county the enquiry is filed under (the action checks the listing there). */
  county: string;
  /** Everywhere they are listed, shown on the directory page only. */
  counties?: string[];
}) {
  return (
    <article className={s.card} aria-label={entry.businessName}>
      <div className={s.head}>
        <h3 className={s.name}>{entry.businessName}</h3>
        <RatingStars avg={entry.ratingAvg} count={entry.ratingCount} />
      </div>
      {entry.blurb && <p className={s.blurb}>{entry.blurb}</p>}
      {serviceNames.length > 0 && (
        <p className={s.services}>
          {serviceNames.slice(0, 6).join(' · ')}
          {serviceNames.length > 6 ? ` · and ${serviceNames.length - 6} more` : ''}
        </p>
      )}
      {counties && counties.length > 0 && (
        <p className={s.covers}>
          <b>Covers</b> {counties.join(', ')}
        </p>
      )}
      <div className={s.links}>
        {entry.website && (
          <a className={s.site} href={entry.website} target="_blank" rel="noopener">
            {siteHost(entry.website)} ↗
          </a>
        )}
        <DirectEnquiryForm contractorId={entry.contractorId} businessName={entry.businessName} county={county} />
      </div>
    </article>
  );
}
