import type { Metadata } from 'next';
import { ALL_YEAR, CALENDAR_SOURCES, MONTHS, ukMonth, type Month } from '@/lib/info/calendar';
import { InfoFrame } from '../InfoFrame';
import css from './calendar.module.css';

export const metadata: Metadata = {
  title: 'Paddock and Grassland Calendar: Jobs and Closed Periods by Month',
  description:
    'What to do on grassland each month of the year, with the legal dates for hedge cutting, slurry and nitrogen fertiliser in England, Wales, Scotland and Northern Ireland.',
  alternates: { canonical: '/info/calendar' },
};

// "This month" moves once a month; an hour's lag at midnight on the 1st is nothing.
export const revalidate = 3600;

function MonthCard({ m, now }: { m: Month; now?: boolean }) {
  return (
    <section className={`${css.month} ${now ? css.monthNow : ''}`} id={m.name.toLowerCase()}>
      <h2 className={css.monthTitle}>
        {m.name}
        {now && <span className={css.nowTag}>This month</span>}
      </h2>
      {m.law.length > 0 && (
        <ul className={css.law} aria-label={`${m.name}: the law`}>
          {m.law.map((l) => (
            <li key={l}>
              <span className={css.lawTag}>The law</span>
              {l}
            </li>
          ))}
        </ul>
      )}
      <ul className={css.jobs} aria-label={`${m.name}: jobs`}>
        {m.jobs.map((j) => (
          <li key={j}>{j}</li>
        ))}
      </ul>
    </section>
  );
}

export default function CalendarPage() {
  const current = ukMonth(new Date());
  // The year starting from this month, so what is next is what comes next.
  const ordered = [...MONTHS.slice(current), ...MONTHS.slice(0, current)];
  return (
    <InfoFrame
      slug="calendar"
      crumb="Calendar"
      eyebrow="Info · Weather and timing"
      title={
        <>
          The year on grass, <em>month by month.</em>
        </>
      }
      sub="The jobs that belong in each month, and the dates the law sets for hedges, slurry and nitrogen. Seasons run two or three weeks later in the north and on high ground; the legal dates do not move."
    >
      <nav className={css.jump} aria-label="Months">
        {MONTHS.map((m, i) => (
          <a key={m.name} href={`#${m.name.toLowerCase()}`} aria-current={i === current ? 'true' : undefined}>
            {m.name.slice(0, 3)}
          </a>
        ))}
      </nav>

      {ordered.map((m, i) => (
        <MonthCard key={m.name} m={m} now={i === 0} />
      ))}

      <section className={css.month}>
        <h2 className={css.monthTitle}>All year</h2>
        <ul className={css.jobs}>
          {ALL_YEAR.map((j) => (
            <li key={j}>{j}</li>
          ))}
        </ul>
      </section>

      <section className={css.sources}>
        <h2>Where this comes from</h2>
        <p>
          The legal dates were checked against the pages below on 27 November 2026. Rules differ between
          England, Wales, Scotland and Northern Ireland, and Nitrate Vulnerable Zone rules apply only
          inside a zone (in Wales, everywhere). The hedge dates are England’s and apply to hedges on or
          beside farmland. Check your own position before relying on a date. The jobs are usual practice,
          not instructions.
        </p>
        <ul>
          {CALENDAR_SOURCES.map((s) => (
            <li key={s.href}>
              <a href={s.href} rel="noopener">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </InfoFrame>
  );
}
