import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * POST|GET /api/cron/draft-chaser — one reminder to people who described a
 * job and never sent it.
 *
 * In the week to 21 September 2026, 27 people reached the confirm screen and
 * 8 typed into a contact field. Every one of the rest is a real piece of work
 * in a real postcode sitting in job_submissions as a draft. Contact details
 * are now kept on blur rather than on submit, so the ones who got as far as
 * their email can be written to; this is what writes to them.
 *
 * Rules it exists to enforce, rather than leave to whoever calls it:
 *
 * - One per draft, ever. `draft_chased_at` is stamped in the same pass that
 *   queues the mail, so a second run cannot pick the same row up, and the
 *   email itself promises this is the only reminder.
 * - Not too soon. Someone still filling the form in another tab has not
 *   abandoned anything, and a reminder arriving while they are mid-sentence
 *   is worse than none.
 * - Not too late. A fortnight on, the grass has been cut by somebody else and
 *   the message is an intrusion rather than a help.
 * - Never a job that was sent. `status = 'draft'` is re-checked on the write,
 *   so a draft confirmed between the read and the update is not chased about
 *   a job it already has.
 */

export const dynamic = 'force-dynamic';

/** Long enough to be sure they have gone. */
const ABANDONED_AFTER_MINUTES = 120;
/** Past this the job has moved on without us. */
const TOO_OLD_AFTER_DAYS = 7;
const BATCH = 25;

/** Vercel Cron sends a bearer token; the SQL scheduler sends a header. */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get('x-cron-secret') === secret;
}

async function run() {
  const admin = createServiceRoleClient();
  const now = Date.now();
  const olderThan = new Date(now - ABANDONED_AFTER_MINUTES * 60_000).toISOString();
  const newerThan = new Date(now - TOO_OLD_AFTER_DAYS * 86_400_000).toISOString();

  const { data: drafts, error } = await admin
    .from('job_submissions')
    .select('id, contact_name, contact_email, service_verbatim, postcode, created_at')
    .eq('status', 'draft')
    .is('draft_chased_at', null)
    .not('contact_email', 'is', null)
    .lte('created_at', olderThan)
    .gte('created_at', newerThan)
    .order('created_at', { ascending: true })
    .limit(BATCH);

  // A query that fails must not read as "nothing to do" — that is how a
  // silent stop looks exactly like a quiet week.
  if (error) throw error;

  let chased = 0;
  for (const d of drafts ?? []) {
    // Claim first. If this does not match — the customer confirmed in the
    // meantime, or another run got there — no email is queued, so the worst
    // case is a reminder not sent rather than one sent twice.
    const { data: claimed } = await admin
      .from('job_submissions')
      .update({ draft_chased_at: new Date().toISOString() })
      .eq('id', d.id)
      .eq('status', 'draft')
      .is('draft_chased_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    const { error: queueError } = await admin.from('pending_emails').insert({
      kind: 'job_draft_chaser',
      to_email: d.contact_email as string,
      payload: {
        submission_id: d.id,
        contact_name: d.contact_name,
        service: d.service_verbatim,
        postcode: d.postcode,
      },
    });

    // The claim is already written. Rather than leave a draft marked chased
    // with nothing sent, hand it back so the next run can try again.
    if (queueError) {
      console.error('[draft-chaser] could not queue, releasing claim:', queueError.message);
      await admin.from('job_submissions').update({ draft_chased_at: null }).eq('id', d.id);
      continue;
    }
    chased++;
  }

  return NextResponse.json({ considered: (drafts ?? []).length, chased });
}

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  return run();
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  return run();
}
