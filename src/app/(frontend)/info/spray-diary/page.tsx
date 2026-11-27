import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { RECORD_COLUMNS, type SprayRecord } from '@/lib/info/sprayRecords';
import { InfoFrame } from '../InfoFrame';
import { RecordForm } from './RecordForm';
import { RecordList } from './RecordList';
import c from '../calc.module.css';
import css from './sprayDiary.module.css';

export const metadata: Metadata = {
  title: 'Spray Diary: Keep Your Pesticide Application Records',
  description:
    'A free spray diary for contractors and landowners: record the product, dose, field, area, weather and operator for every application, and download the lot as a spreadsheet.',
  alternates: { canonical: '/info/spray-diary' },
};
export const dynamic = 'force-dynamic';

const SHOWN = 200;

/**
 * The spray diary. Signed out it explains itself and asks for a sign-in;
 * signed in it is the form and the user's records, newest first
 * (spray_records, owner-only RLS). `?copy=<id>` starts the form from one of
 * their records; `?run=<id>` from a saved coverage map run (field, date,
 * times and area from the map, and the record linked to it).
 */
export default async function SprayDiaryPage({ searchParams }: { searchParams: Promise<{ copy?: string; run?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sp = await searchParams;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

  let records: SprayRecord[] = [];
  let total = 0;
  if (user) {
    const { data, count } = await supabase
      .from('spray_records')
      .select(RECORD_COLUMNS, { count: 'exact' })
      .eq('user_id', user.id)
      .order('sprayed_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(SHOWN);
    records = (data ?? []) as SprayRecord[];
    total = count ?? records.length;
  }
  const copyId = typeof sp.copy === 'string' ? sp.copy : null;
  const copied = copyId ? records.find((r) => r.id === copyId) : undefined;
  // Otherwise carry over what does not change from job to job.
  const last = records[0];
  let start: Partial<SprayRecord> = copied
    ? {
        ...copied,
        start_time: null,
        end_time: null,
        sprayed_on: undefined,
        // A copy made the same day is the next product in the tank: it stays on
        // the same map. A copy for another day is a new job.
        run_id: copied.sprayed_on === today ? copied.run_id : null,
      }
    : last
      ? { operator: last.operator, certificate: last.certificate, equipment: last.equipment }
      : {};

  // From a coverage map run: the map knows where, when and how much ground.
  let fromRun: { id: string; label: string } | null = null;
  const runId = user && typeof sp.run === 'string' && /^[0-9a-f-]{36}$/i.test(sp.run) ? sp.run : null;
  if (user && runId) {
    const { data: run } = await supabase
      .from('coverage_runs')
      .select('id, site, started_at, ended_at, covered_ha')
      .eq('id', runId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (run) {
      const ukDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      const ukTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
      // A second product for the same run (a tank mix) starts from the first.
      const sibling = records.find((r) => r.run_id === run.id);
      start = {
        ...(sibling ? { ...sibling, product: '', mapp: null, dose: undefined, notes: null } : start),
        run_id: run.id,
        site: run.site || sibling?.site || '',
        sprayed_on: ukDay(run.started_at),
        start_time: ukTime(run.started_at),
        // Past midnight, the finish is on another day: leave it to be typed.
        end_time: ukDay(run.ended_at) === ukDay(run.started_at) ? ukTime(run.ended_at) : null,
        area_ha: Math.round(Number(run.covered_ha) * 1000) / 1000,
      };
      fromRun = { id: run.id, label: `${run.site ? `${run.site}, ` : ''}${new Date(run.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}` };
    }
  }

  return (
    <InfoFrame
      slug="spray-diary"
      crumb="Spray diary"
      eyebrow="Info · Spraying"
      title={
        <>
          Your spray records, <em>kept as you finish the job.</em>
        </>
      }
      sub="Anyone spraying as part of their work must keep a record of every product applied. Fill it in at the gateway, and download the lot as a spreadsheet when an inspector or an assurance scheme asks."
    >
      {user ? (
        <>
          <RecordForm key={fromRun?.id ?? copied?.id ?? 'new'} start={start} today={today} fromRun={fromRun} />
          <section>
            <div className={css.listHead}>
              <h2 className={css.listTitle}>
                {total === 0 ? 'No records yet' : `${total.toLocaleString('en-GB')} ${total === 1 ? 'record' : 'records'}`}
              </h2>
              {total > 0 && (
                <a href="/info/spray-diary/export" className={css.download} download>
                  Download as a spreadsheet
                </a>
              )}
            </div>
            {total > records.length && <p className={css.note}>Showing the latest {records.length}. The download has them all.</p>}
            <RecordList records={records} today={today} />
          </section>
        </>
      ) : (
        <div className={css.signIn}>
          <p>The diary is free. It needs an account so that your records are yours alone and are still there next year.</p>
          <div className={css.signInRow}>
            <Link href="/login?next=/info/spray-diary" className={css.save}>
              Sign in
            </Link>
            <Link href="/signup" className={css.second} data-app-hide>
              Join as a contractor
            </Link>
          </div>
        </div>
      )}

      <section className={c.prose}>
        <h2>What the record has to say</h2>
        <p>
          The law asks professional users of plant protection products to record, for each application, the name of the product, the time and the dose
          of application, and the area and crop it went on, and to keep the record for at least three years. The diary’s starred boxes cover those.
        </p>
        <p>
          The rest is what makes the record worth having when a neighbour, a customer or an inspector asks a question: the MAPP number from the label,
          the water volume, the wind and temperature at the time, who sprayed and with what certificate, and the day stock may go back.
        </p>
        <p>
          In Northern Ireland the rules went further on 1 January 2026: the record must also carry the MAPP number, and from 1 January 2027 it has
          to be kept in a form a computer can read, which a spreadsheet file is and a photograph of a notebook is not. A contractor there is
          responsible for the record and must give the customer a copy. The diary’s download is a spreadsheet file with the MAPP number in it.
        </p>
        <p>
          A business or sole trader using professional products in England, Scotland or Wales must also be registered with Defra as a user, within
          three months of starting.
        </p>
        <h3>One record for each product</h3>
        <p>
          A tank mix of two products is two records. Save the first, then use “Copy to a new record” and change the product and dose.
        </p>
        <h3>Stock out until</h3>
        <p>
          Take the interval from the product label and enter the date it ends. Where ragwort or another poisonous weed was sprayed, stock stay out until
          it has died down and been cleared, however long that takes: dying ragwort is more palatable, not less.
        </p>
        <p className={c.fine}>
          Your records are private to your account. We do not share them, and deleting your account deletes them.
        </p>
      </section>
    </InfoFrame>
  );
}
