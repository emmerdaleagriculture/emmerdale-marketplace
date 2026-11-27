import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TASK_LABEL, type RunTask } from '@/lib/info/coverage';
import { ACRES_PER_HA, fig } from '@/lib/info/sprayMaths';
import { InfoFrame } from '../InfoFrame';
import { CoverageMapper } from './CoverageMapper';
import c from '../calc.module.css';
import css from './coverage.module.css';

export const metadata: Metadata = {
  title: 'Coverage Map: See the Field Fill In as You Spray or Spread',
  description:
    'A live coverage map for spraying, fertilising and seeding: set your working width, and watch the ground you have covered fill in on the satellite map, with overlap shown. Pause to refill, save the run, and link it to your spray record.',
  alternates: { canonical: '/info/coverage-map' },
};
export const dynamic = 'force-dynamic';

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});

export default async function CoverageMapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const runs = user
    ? ((
        await supabase
          .from('coverage_runs')
          .select('id, task, site, width_m, started_at, covered_ha, overlap_ha, active_seconds')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
          .limit(50)
      ).data ?? [])
    : [];

  return (
    <InfoFrame
      slug="coverage-map"
      crumb="Coverage map"
      eyebrow="Info · Spraying and spreading"
      title={
        <>
          Watch the field fill in, <em>pass by pass.</em>
        </>
      }
      sub="Set the machine’s working width and press Start. The ground you cover fills in on the satellite map as you go, with any overlap in orange. Pause to refill, then save the run and add it to your spray diary."
    >
      <CoverageMapper signedIn={!!user} />
      <p className={css.legend}>
        <span>
          <i className={css.legendOnce} />
          Covered once
        </span>
        <span>
          <i className={css.legendTwice} />
          Covered twice or more
        </span>
        <span>
          <i className={css.legendBoom} />
          The machine’s width
        </span>
      </p>

      {runs.length > 0 && (
        <section>
          <h2 className={css.runsHead}>Your saved runs</h2>
          <ul className={css.runs}>
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/info/coverage-map/${r.id}`} className={css.run} prefetch={false}>
                  <span className={css.runTitle}>
                    {r.site || TASK_LABEL[r.task as RunTask] || 'Run'} · {dayFmt.format(new Date(r.started_at))}
                  </span>
                  <span className={css.runLine}>
                    {TASK_LABEL[r.task as RunTask]}: {fig(Number(r.covered_ha) * ACRES_PER_HA)} acres ({fig(Number(r.covered_ha))} ha) at{' '}
                    {fig(Number(r.width_m))} m
                    {Number(r.covered_ha) > 0 && `, ${Math.round((Number(r.overlap_ha) / Number(r.covered_ha)) * 100)}% overlap`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={c.prose}>
        <h2>Getting a good map</h2>
        <ul>
          <li>
            <strong>Plug the GPS receiver in first.</strong> A receiver such as a Bad Elf, Garmin GLO or Dual XGPS hands its position to the phone,
            and the map uses it without any setting. The figure in the corner of the map says how good the fix is: a receiver gives 1 to 3 metres, a
            phone on its own 5 or more. Fixes worse than 10 metres are ignored.
          </li>
          <li>
            <strong>Keep the screen open.</strong> The phone stops sending its position when it locks or you switch app. The map holds the screen on
            while you work; if a gap does happen, the map carries on from where you are and leaves the gap unpainted rather than guess.
          </li>
          <li>
            <strong>Working width</strong> is the width the machine actually treats: the boom’s spray width, or the spreader’s bout width from its
            chart, not the width it spreads to the edges.
          </li>
          <li>
            <strong>Pause to refill.</strong> Nothing is painted while paused, so driving to the bowser and back does not count. Resume when the
            machine is back where it stopped.
          </li>
          <li>
            The width is drawn centred on the phone or receiver. Put the receiver on the middle of the cab roof, or as near the centre line as you
            can.
          </li>
          <li>
            <strong>Overlap</strong> is ground gone over twice or more. A little on headlands is normal; more than a tenth of the field usually means
            the bouts are too close.
          </li>
        </ul>
        <p>
          A saved run can be added to the <Link href="/info/spray-diary">spray diary</Link>: the field, the date, the times and the area covered are
          filled in from the map, and the record links back to it.
        </p>
        <p className={c.fine}>
          The run is kept on your phone while you work and only sent when you save it. Saved runs are private to your account. The map is a record of
          where the machine went, not proof of what it applied: section control, nozzles and spread pattern are yours to check.
        </p>
      </section>
    </InfoFrame>
  );
}
