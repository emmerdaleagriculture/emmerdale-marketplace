import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ConfirmStep } from '../../ConfirmStep';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { AreaUnit, CanonicalService, ParseResult, Urgency } from '@/lib/jobParse/schema';
import Link from 'next/link';
import { CONFIRM_SUCCESS, START_COMPLETE_PATH } from '../../copy';
import { ReplaceWith } from './ReplaceWith';
import { justSentJob } from '@/lib/jobCookie';
import a from '../../../auth.module.css';
import f from '@/components/forms/forms.module.css';

export const metadata: Metadata = {
  title: 'Finish your job',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * Pick up a job that was described and never sent.
 *
 * Most people who reach the confirm screen leave it, and the reminder email
 * they get points here. Landing them back on a blank form would be worse than
 * not writing at all, so this rebuilds the confirm step from the draft with
 * everything they typed still in it — their words, their postcode, whatever
 * they had filled in when they stopped.
 *
 * No sign-in, and the id in the URL is the whole of the authority, which is
 * the same trust confirmJobAction already places in it: that id was minted by
 * a Turnstile-verified parse, is unguessable, and already authorises turning
 * this draft into a live job. A link that could do less than the form it
 * leads to would be security theatre.
 *
 * Only ever a draft form. Once a job is sent, `status` moves off 'draft' and
 * this route shows a bare "sent" or "closed" card — nothing of the job itself, so
 * a forwarded reminder cannot be used to look at a live job, and no form that
 * would quietly submit it a second time.
 *
 * Not a 404, because the customer pressing Send here is one of the people who
 * reaches that branch: setting the just-sent cookie makes Next re-render this
 * page inside the action's own response, the job is no longer a draft by then,
 * and a notFound() replaced the form before ConfirmStep could move on to the
 * thank-you page. A live customer saw that and reported "Wouldn't send" — for
 * a job that had gone to eleven contractors.
 */
export default async function ResumeDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = createServiceRoleClient();
  const { data: src } = await admin
    .from('job_submissions')
    .select('*, service:services(name)')
    .eq('id', id)
    .maybeSingle();
  if (!src) notFound();

  if (src.status !== 'draft') {
    // Their own send, seconds ago: carry on to the thank-you page exactly as
    // the /start flow does, so the ad conversion still counts. The card shows
    // meanwhile, as ConfirmStep's own success card does.
    const justSent = await justSentJob();
    const ownSend = justSent !== null && justSent === src.client_token;
    // Never confirmed means the draft was closed unsent (abandoned), not sent.
    const sent = src.confirmed_at !== null;
    return (
      <div className={a.wrap}>
        <SiteHeader />
        <main className={a.main}>
          <div className={a.narrow}>
            <div className={a.eyebrow}>{sent ? 'Already sent' : 'Closed'}</div>
            <h1 className={a.title}>
              {sent ? 'This job has been sent.' : 'This draft has closed.'}
            </h1>
            <div className={a.card}>
              {sent ? (
                <p className={f.success} style={{ fontSize: 16, margin: 0 }}>
                  {ownSend
                    ? CONFIRM_SUCCESS
                    : 'There’s nothing more to do here. We emailed you a link to follow the job.'}
                </p>
              ) : (
                <p style={{ margin: 0 }}>
                  It was never sent to contractors.{' '}
                  <Link href="/start">Describe the job again</Link> to send it.
                </p>
              )}
            </div>
          </div>
        </main>
        <SiteFooter />
        {ownSend && <ReplaceWith href={START_COMPLETE_PATH} />}
      </div>
    );
  }

  const { data: county } = src.county_id
    ? await admin.from('counties').select('name').eq('id', src.county_id).maybeSingle()
    : { data: null };

  const result: ParseResult = {
    submission_id: src.id,
    parse_source: 'deterministic_fallback',
    service: ((src.service as { name: string } | null)?.name ?? null) as CanonicalService | null,
    service_verbatim: src.service_verbatim ?? src.raw_text ?? '',
    service_alternatives: [],
    area_value: src.area_value,
    area_unit: (src.area_unit as AreaUnit | null) ?? null,
    postcode: src.postcode,
    county_name: county?.name ?? null,
    county_candidates: [],
    county_choice_reason: null,
    lat: src.lat,
    lng: src.lng,
    urgency: (src.urgency as Urgency | null) ?? null,
    // Unlike a repeat order, this draft is days old at most, so a date the
    // customer chose themselves is still the date they meant.
    target_date: src.target_date,
    access_notes: src.access_notes ?? '',
    obstacles: src.obstacles ?? '',
    service_attributes: (src.service_attributes as Record<string, string>) ?? {},
    boundary: src.boundary ?? null,
    area_mapped_value: src.area_mapped_value ?? null,
    gate_w3w: src.gate_w3w ?? null,
    gate_width: src.gate_width ?? null,
    parse_confidence: {},
    missing_fields: [],
  };

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Nearly there</div>
          <h1 className={a.title}>Everything you wrote is still here.</h1>
          <p className={a.sub}>
            Nothing has gone out to contractors yet. Check it over and send it, and
            contractors who cover{' '}
            {county?.name ? county.name : 'your area'} will price it — their prices
            appear on one page as they come in. It costs nothing to ask and you are
            not obliged to accept any of them.
          </p>
          <ConfirmStep result={result} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
