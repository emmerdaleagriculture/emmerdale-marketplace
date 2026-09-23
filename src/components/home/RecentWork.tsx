import { getRecentWork, MIN_RECENT_WORK, serviceFilters } from '@/lib/home/recentWork';
import { RecentWorkBoard } from './RecentWorkBoard';
import { ViewOnce } from './Track';
import s from './home.module.css';

/**
 * What past work actually cost.
 *
 * This is what stands in place of a published price list. The variance in this
 * trade is too wide for any band to survive contact with real jobs — access,
 * ground condition, season and scale move the number more than the name of the
 * service does — and a band the operators then can't honour damages our
 * credibility rather than theirs. Finished work makes no promise about the next
 * job, so nobody can be ambushed by it.
 *
 * Headed "Work booked through us" rather than "Recent work": the cards carry
 * no dates, so recency isn't a claim this can stand behind. Not "completed"
 * either: since 20260923180000 a job joins the board when it is awarded, and
 * some of those are still to be done.
 *
 * Fetches on the server and hands the rows to a client child, so the chips are
 * interactive without the page giving up its ISR caching.
 */
export async function RecentWork() {
  const rows = await getRecentWork();
  if (rows.length < MIN_RECENT_WORK) return null;

  return (
    <section className={s.work} aria-labelledby="work-title">
      <div className={s.container}>
        <p className={s.eyebrow}>What people paid</p>
        <h2 id="work-title" className={s.sectionH}>
          Work booked through us
        </h2>
        <p className={s.workSub}>
          Real jobs and the price agreed. Every job prices differently —
          access, ground and scale move the number more than the service does —
          so treat these as what past work came to, not a quote for yours.
        </p>
        {/* row_count travels with it: "saw the board" means something
            different with four jobs on it than with forty. */}
        <ViewOnce event="view_recent_work" params={{ row_count: rows.length }} />
        <RecentWorkBoard rows={rows} filters={serviceFilters(rows)} />
      </div>
    </section>
  );
}
