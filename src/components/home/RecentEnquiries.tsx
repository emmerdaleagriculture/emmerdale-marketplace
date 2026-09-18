import { getRecentEnquiries, MIN_ENQUIRIES, formatEnquiryDate } from '@/lib/home/recentEnquiries';
import s from './home.module.css';

/**
 * What's being asked for, lately.
 *
 * Answers "is anyone actually using this?" without publishing anything about
 * the people who asked. Each card is a county, an approximate size where one
 * was extracted, and the date it arrived — nothing finer. There is no service
 * name because job creation records none (see the view's own comment).
 *
 * These are enquiries and the copy says so: most never became a booking, and
 * drafts are counted. Overstating that would be the same mistake as inventing
 * the jobs.
 *
 * Renders nothing below MIN_ENQUIRIES rows — a strip with two cards on it
 * advertises that almost nobody has been in touch.
 */
export async function RecentEnquiries() {
  const rows = await getRecentEnquiries();
  if (rows.length < MIN_ENQUIRIES) return null;

  return (
    <section className={s.enquiries} aria-labelledby="enquiries-title">
      <div className={s.container}>
        <p className={s.eyebrow}>What&rsquo;s coming in</p>
        <h2 id="enquiries-title" className={s.sectionH}>
          Recent enquiries
        </h2>
        <p className={s.enquiriesSub}>
          Land people have asked us to price recently. These are enquiries
          rather than completed bookings, and we don&rsquo;t publish anyone&rsquo;s
          location beyond the county.
        </p>
        <ul className={s.enquiriesGrid}>
          {rows.map((r, i) => (
            <li key={`${r.county}-${r.created_on}-${i}`} className={s.enquiry}>
              {/* Only rendered when the parse actually extracted an area —
                  never a stand-in descriptor, which would be inventing the
                  one detail the card is meant to report. */}
              {r.size_label ? <span className={s.enquirySize}>{r.size_label}</span> : null}
              <span className={s.enquiryCounty}>{r.county}</span>
              <time className={s.enquiryDate} dateTime={r.created_on}>
                {formatEnquiryDate(r.created_on)}
              </time>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
