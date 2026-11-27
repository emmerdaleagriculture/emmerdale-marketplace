import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchForecast, forecastSource, resolvePlace } from '@/lib/info/forecast';
import { LIMITS, goodWindows, rate, type Job, type Level } from '@/lib/info/windows';
import { groupDays, hourLabel, span, windowLabel, type Day } from '@/lib/info/windowsView';
import { InfoHelp } from '../InfoHelp';
import { InfoFrame } from '../InfoFrame';
import { PlaceForm } from './PlaceForm';
import css from './windows.module.css';

const META: Metadata = {
  title: 'Spraying, Fertilising and Seeding Windows for Your Postcode',
  description:
    'When to spray, spread fertiliser or sow grass seed over the next nine days, rated hour by hour from the forecast for your postcode against the Code of Practice wind limits.',
  alternates: { canonical: '/info/work-windows' },
};

type Search = Promise<{ at?: string | string[]; job?: string | string[] }>;

/**
 * One page to index, not one per postcode: a forecast for a place is stale
 * within the hour, and every such URL a crawler follows is a paid forecast
 * call. The bare page is the canonical one; any ?at= version is noindex.
 */
export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const sp = await searchParams;
  return sp.at ? { ...META, robots: { index: false, follow: false } } : META;
}

const JOBS: { key: Job; label: string; verb: string }[] = [
  { key: 'spray', label: 'Spraying', verb: 'spraying' },
  { key: 'fertilise', label: 'Fertilising', verb: 'spreading fertiliser' },
  { key: 'seed', label: 'Seeding', verb: 'sowing grass seed' },
];

const LEVEL_WORD: Record<Level, string> = { good: 'Good', care: 'With care', no: 'No' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function WorkWindowsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const at = one(sp.at).slice(0, 40);
  const job = JOBS.find((j) => j.key === one(sp.job)) ?? JOBS[0];

  const place = at ? await resolvePlace(at) : null;
  const forecast = place ? await fetchForecast(place.lat, place.lng) : null;
  const slots = forecast?.slots ?? null;
  const source = forecast?.source ?? forecastSource();
  const now = new Date();
  const rated = place && slots ? rate(slots, job.key, place.lat, place.lng) : null;
  const days = rated ? groupDays(rated, now) : [];
  const windows = rated ? goodWindows(rated) : [];

  return (
    <InfoFrame
      slug="work-windows"
      crumb="Work windows"
      eyebrow="Info · Weather and timing"
      title={
        <>
          When to spray, spread or sow, <em>from the forecast for your postcode.</em>
        </>
      }
      sub="The days ahead, hour by hour, rated against the limits the job is done to: wind at the boom, rain to come, frost and warmth."
    >
      <PlaceForm at={at} job={job.key} shown={Boolean(rated)} />

      {at && !place && (
        <p className={css.error} role="alert">
          We could not place “{at}”. Try a UK postcode, or just its first half, such as SO51.
        </p>
      )}
      {place && !slots && (
        <p className={css.error} role="alert">
          The forecast did not load. Try again in a minute.
        </p>
      )}

      {rated && place && (
        <>
          <nav className={css.jobs} aria-label="Job">
            {JOBS.map((j) => (
              <Link
                key={j.key}
                href={`/info/work-windows?at=${encodeURIComponent(at)}&job=${j.key}`}
                replace
                scroll={false}
                prefetch={false}
                aria-current={j.key === job.key ? 'page' : undefined}
              >
                {j.label}
              </Link>
            ))}
          </nav>

          <div className={css.summary} data-level={windows.length ? 'good' : 'no'}>
            <div className={css.summaryKicker}>
              {job.label} near {place.label}
            </div>
            {windows.length ? (
              <>
                <div className={css.summaryMain}>Next good window: {windowLabel(windows[0], now)}</div>
                {windows.length > 1 && (
                  <div className={css.summaryMore}>
                    Then {windows.slice(1, 3).map((w) => windowLabel(w, now)).join('; ')}.
                  </div>
                )}
              </>
            ) : (
              <div className={css.summaryMain}>No clear daylight window for {job.verb} in this forecast.</div>
            )}
          </div>

          <ul className={css.key} aria-label="Key">
            <li data-level="good">Good</li>
            <li data-level="care">With care</li>
            <li data-level="no">No</li>
            <li data-night>Dark</li>
          </ul>

          {days.map((d) => (
            <DayBlock key={d.key} day={d} job={job.key} />
          ))}

          <p className={css.credit}>
            {source === 'open-meteo' ? (
              <>
                <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a> (CC BY 4.0), refreshed every half hour.
              </>
            ) : (
              <>
                Forecast data from <a href="https://www.met.no/en">MET Norway</a> (CC BY 4.0), refreshed every half hour. Wind is
                the forecast mean; gusts will be higher.
              </>
            )}
          </p>
        </>
      )}

      <InfoHelp title="How the ratings are worked out">
        <Method soil={source === 'open-meteo'} />
      </InfoHelp>
    </InfoFrame>
  );
}

function DayBlock({ day, job }: { day: Day; job: Job }) {
  return (
    <section className={css.day}>
      <h2 className={css.dayTitle}>
        {day.label}
        {!day.detailed && <span className={css.outlook}>Outlook</span>}
      </h2>
      <div className={css.strip} role="img" aria-label={`${day.label}: ${day.runs.map((r) => `${hourLabel(r.start)} to ${hourLabel(r.end)} ${LEVEL_WORD[r.level]}`).join(', ') || 'no daylight hours left'}`}>
        {day.slots.map((s) => (
          <span key={s.t} className={css.cell} style={{ flexGrow: s.hours }} data-level={s.level} data-night={s.daylight ? undefined : ''} />
        ))}
      </div>
      <div className={css.ticks} aria-hidden="true">
        <span>{hourLabel(day.slots[0].t)}</span>
        <span>{hourLabel(new Date(new Date(day.slots[day.slots.length - 1].t).getTime() + day.slots[day.slots.length - 1].hours * 3600000).toISOString())}</span>
      </div>
      {day.runs.length === 0 ? (
        <p className={css.none}>No daylight hours left in the forecast for this day.</p>
      ) : (
        <ul className={css.runs}>
          {day.runs.map((r) => (
            <li key={r.start} className={css.run} data-level={r.level}>
              <div className={css.runHead}>
                <span className={css.runTime}>
                  {hourLabel(r.start)} to {hourLabel(r.end)}
                </span>
                <span className={css.runLevel}>{LEVEL_WORD[r.level]}</span>
              </div>
              {r.reasons.length > 0 && <div className={css.runWhy}>{r.reasons.join('. ')}.</div>}
              <div className={css.runFigures}>
                {job === 'spray' ? `Wind ${span(r.boomMph, ' mph')} at the boom` : `Wind ${span([r.boomMph[0] * 2, r.boomMph[1] * 2], ' mph')}`}
                {' · '}
                {span(r.tempC, '°C')}
                {' · '}
                {r.rainMm >= 0.1 ? `${r.rainMm.toFixed(1)} mm rain` : 'dry'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The rules in words, printed from the same constants the ratings use. */
function Method({ soil }: { soil: boolean }) {
  const L = LIMITS;
  return (
    <section className={css.method}>
      <h2>How the ratings are worked out</h2>

      <h3>Spraying</h3>
      <ul>
        <li>
          <strong>Wind.</strong> The Code of Practice for Using Plant Protection Products sets its limits at
          nozzle height: {L.sprayIdealMinKmh} to {L.sprayIdealMaxKmh} km/h (2 to 4 mph, a light breeze)
          is ideal and {L.sprayCalmKmh} to {L.sprayIdealMinKmh} km/h acceptable. From{' '}
          {L.sprayIdealMaxKmh} to {L.sprayMaxKmh} km/h (4 to 6 mph) it warns of drift and says to avoid
          spraying herbicides, so we mark it “with care”. Above {L.sprayMaxKmh} km/h it says do not
          spray. Under {L.sprayCalmKmh} km/h is calm: medium or coarse spray only, also “with care”.
          Forecast wind is measured ten metres up. The Code gives no sum for bringing that down to the
          boom, but its table pairs each wind force with a nozzle-height speed about half as fast, so
          half is what we use. Over bare ground the wind at the boom is higher.
          {soil && (
            <>
              {' '}
              Gusts are judged the same way: gusts over {L.sprayMaxKmh} km/h at the boom are marked “with
              care”, and over {(L.sprayMaxKmh * L.sprayGustFactor).toFixed(1)} km/h rule the hour out. Those
              two are our own figures.
            </>
          )}
        </li>
        <li>
          <strong>Rain.</strong> There is no general rule: the rainfast time is on the label, and two
          hours is typical of the common grassland herbicides. Rain in the hour, or within{' '}
          {L.sprayDryHours} hours after it, rules the hour out. Rain within {L.sprayWatchHours} hours is
          marked “with care”.
        </li>
        <li>
          <strong>Temperature.</strong> The Code says to avoid spraying above {L.sprayHotC}°C. The rest
          are working rules of thumb, not the Code’s: no spraying in frost ({L.sprayFrostC}°C or below),
          and “with care” below {L.sprayCoolC}°C, when weeds are hardly growing and take a herbicide in
          slowly, and above {L.sprayWarmC}°C.
        </li>
        <li>
          <strong>Dew.</strong> Another rule of thumb: air within {L.dewGapC}°C of its dew point at{' '}
          {L.dewHumidityPct}% humidity or more means wet leaves, which shed spray.
        </li>
      </ul>

      <h3>Fertilising</h3>
      <ul>
        <li>
          <strong>Rain and run-off.</strong> In England the Farming Rules for Water forbid spreading on
          waterlogged, flooded or snow-covered ground, or ground frozen for more than 12 of the last 24
          hours, and tell you to take the forecast into account. They name no amount of rain, so the
          figures are ours: an hour is ruled out when {L.fertHeavyRainMm} mm or more is due within 48
          hours or the air is at freezing, and marked “with care” from {L.fertWetRainMm} mm. Scotland’s
          rule is no spreading when heavy rain is forecast within 24 hours. The forecast cannot see
          whether your ground is already waterlogged: that is yours to judge.
        </li>
        <li>
          <strong>Warmth.</strong> Grass starts to grow, and to use nitrogen, when the soil reaches about{' '}
          {L.fertGrowthC}°C at 10 cm (AHDB).{' '}
          {soil
            ? 'We use the forecast soil temperature at 6 cm, averaged over the day ahead, and rule out frozen ground.'
            : 'The forecast carries no soil temperature, so the average air temperature of the five days ahead stands in for it.'}
        </li>
        <li>
          <strong>Wind.</strong> Above {L.fertWindMph} mph a spinning-disc spreader’s pattern suffers,
          urea worst. A rule of thumb: no official limit is published.
        </li>
        <li>
          <strong>Closed periods.</strong> The forecast knows nothing of these. In an English Nitrate
          Vulnerable Zone, and anywhere in Wales, manufactured nitrogen may not go on grass between 15
          September and 15 January. The dates for each nation are on{' '}
          <Link href="/info/calendar">the calendar</Link>.
        </li>
      </ul>

      <h3>Seeding</h3>
      <ul>
        <li>
          <strong>Warmth.</strong> The seed trade’s figure is soil at {L.seedGrassC}°C or more for grass
          seed; clover wants at least as much.{' '}
          {soil
            ? 'We use the forecast soil temperature at 6 cm, averaged over the day ahead'
            : 'The average air temperature of the five days ahead stands in for soil'}
          : below {L.seedMarginalC}°C is a no, between the two is slow.
        </li>
        <li>
          <strong>Moisture.</strong> Less than {L.seedMoistureMm} mm of rain in the five days ahead is
          marked “with care”, as is {L.seedWetDayMm} mm or more in the next day, when the ground may not
          carry a tractor. Frost in the five days ahead is flagged too. These are our own working
          figures.
        </li>
      </ul>

      <p className={css.fine}>
        A forecast is a forecast. Measure the wind in the field before you spray, read the product label,
        and keep to any buffer zone or local condition it sets. Nothing here overrides either.
      </p>
    </section>
  );
}
