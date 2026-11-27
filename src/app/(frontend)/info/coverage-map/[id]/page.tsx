import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { parseTrack, TASK_LABEL, type RunTask } from '@/lib/info/coverage';
import { ACRES_PER_HA, fig } from '@/lib/info/sprayMaths';
import { InfoFrame } from '../../InfoFrame';
import { RunMap } from '../RunMap';
import { DeleteRun } from './DeleteRun';
import css from '../coverage.module.css';

export const metadata: Metadata = {
  title: 'Saved run · Coverage map',
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

const when = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/London',
});
const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});
const duration = (s: number) => {
  const total = Math.round(s / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One saved coverage run: its map, its figures, and the spray records that point at it. */
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/info/coverage-map/${id}`);

  const { data: run } = await supabase
    .from('coverage_runs')
    .select('id, task, site, width_m, started_at, ended_at, active_seconds, distance_m, covered_ha, overlap_ha, applied_ha, track')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!run) notFound();
  const { data: records } = await supabase
    .from('spray_records')
    .select('id, product, dose, dose_unit, sprayed_on')
    .eq('run_id', id)
    .eq('user_id', user.id)
    .order('created_at');

  const track = parseTrack(run.track) ?? [];
  const covered = Number(run.covered_ha);
  const overlap = Number(run.overlap_ha);
  const task = run.task as RunTask;
  const started = new Date(run.started_at);
  const ended = new Date(run.ended_at);
  const linked = records ?? [];

  return (
    <InfoFrame
      crumb="Coverage map"
      eyebrow={`Info · ${TASK_LABEL[task]}`}
      title={<>{run.site || TASK_LABEL[task]}</>}
      sub={`${when.format(started)}, ${clock.format(started)} to ${clock.format(ended)}`}
    >
      <RunMap track={track} widthM={Number(run.width_m)} />
      <p className={css.legend}>
        <span>
          <i className={css.legendOnce} />
          Covered once
        </span>
        <span>
          <i className={css.legendTwice} />
          Covered twice or more
        </span>
      </p>

      <div className={css.done}>
        <p className={css.doneMain}>
          {fig(covered * ACRES_PER_HA)} acres <span>· {fig(covered)} ha covered</span>
        </p>
        <ul className={css.doneList}>
          <li>
            Overlap: <strong>{fig(overlap * ACRES_PER_HA)} acres</strong>
            {covered > 0 && ` (${Math.round((overlap / covered) * 100)}%)`}
          </li>
          <li>
            Working: <strong>{duration(run.active_seconds)}</strong>, {fig(Number(run.distance_m) / 1000)} km at {fig(Number(run.width_m))} m wide
          </li>
          {run.active_seconds > 0 && (
            <li>
              Work rate: <strong>{fig((covered * ACRES_PER_HA) / (run.active_seconds / 3600))} acres an hour</strong>
            </li>
          )}
        </ul>
      </div>

      <section>
        <h2 className={css.runsHead}>Spray records</h2>
        {linked.length > 0 ? (
          <ul className={css.runs}>
            {linked.map((r) => (
              <li key={r.id} className={css.run}>
                <span className={css.runTitle}>{r.product}</span>
                <span className={css.runLine}>
                  {fig(Number(r.dose))} {r.dose_unit}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={css.hint}>
            {task === 'spray'
              ? 'No spray record points at this run yet.'
              : 'A spray record can point at any run, if a product went on with this one.'}
          </p>
        )}
        <div className={css.links}>
          <Link href={`/info/spray-diary?run=${run.id}#add`} prefetch={false}>
            {linked.length > 0 ? 'Add another product (tank mix)' : 'Add the spray record'}
          </Link>
          <Link href="/info/coverage-map">All runs</Link>
        </div>
      </section>

      <DeleteRun id={run.id} linked={linked.length} />
    </InfoFrame>
  );
}
