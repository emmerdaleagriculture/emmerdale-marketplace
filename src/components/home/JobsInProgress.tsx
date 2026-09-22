import { getJobsInProgress, MIN_JOBS, formatJobDate } from '@/lib/home/jobsInProgress';
import s from './home.module.css';

/**
 * The work under way right now, above the completed-work board.
 *
 * Answers "is anyone actually using this?" with live jobs rather than
 * enquiries — these have been sent to contractors and are not yet finished,
 * dead or withdrawn. It publishes nothing about the people who asked: a
 * county, an approximate size where one was extracted, and the date it came
 * in. Nothing finer. There is no service name because job creation records
 * none (see the view's own comment), and inventing one from the customer's
 * free text is exactly what the view exists to prevent.
 *
 * Renders nothing below MIN_JOBS rows — a strip with two cards on it
 * advertises that almost nobody has been in touch.
 */
export async function JobsInProgress() {
  const rows = await getJobsInProgress();
  if (rows.length < MIN_JOBS) return null;

  return (
    <section className={s.enquiries} aria-labelledby="in-progress-title">
      <div className={s.container}>
        <p className={s.eyebrow}>On the go</p>
        <h2 id="in-progress-title" className={s.sectionH}>
          Jobs in progress
        </h2>
        <p className={s.enquiriesSub}>
          Land being priced and worked on right now. We don&rsquo;t publish
          anyone&rsquo;s location beyond the county.
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
                {formatJobDate(r.created_on)}
              </time>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
