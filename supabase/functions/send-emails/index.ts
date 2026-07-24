// Edge Function: drain the pending_emails queue via Resend (spec §4, §8).
//
// State transitions (open_due_jobs / admin actions) only ever
// INSERT into pending_emails — never make network calls. This function, run on a
// schedule (pg_cron → pg_net), does the sending, so the DB stays fast and
// transactional.
//
// Guarded by an x-cron-secret header (verify_jwt = false in config.toml) so the
// scheduler can call it without a user JWT. Transient/DNS failures keep the row
// 'pending' and increment attempts; after MAX_ATTEMPTS it becomes 'failed'. So
// once the Resend domain verifies, already-queued mail sends on the next tick.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_ATTEMPTS = 5;
const BATCH = 50;

type PendingEmail = {
  id: string;
  kind: string;
  to_email: string;
  payload: Record<string, unknown>;
  attempts: number;
};

const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://emmerdaleagriculture.com').replace(/\/$/, '');

function render(kind: string, p: Record<string, unknown>): { subject: string; text: string } {
  const title = String(p.title ?? 'a job');
  const where = [p.town, p.postcode_district].filter(Boolean).join(', ');
  const jobLink = p.job_id ? `${SITE_URL}/jobs/${p.job_id}` : `${SITE_URL}/jobs`;
  const signIn = `Sign in to view it: ${jobLink}`;
  switch (kind) {
    case 'new_job':
      return {
        subject: `New job in your area: ${title}`,
        text:
          `A new job has been posted in one of your counties.\n\n` +
          `${title}\n${where}\n\n` +
          `First come, first served — the first contractor to claim it gets the ` +
          `customer's details.\n\n${signIn}`,
      };
    case 'exclusive_new':
      return {
        subject: `Exclusive access (12h head start): ${title}`,
        text:
          `As a paid member you get first access to this new job${where ? ` in ${where}` : ''}, ` +
          `before it opens to the rest of the network.\n\n` +
          `${title}\n\nThe first claim wins.\n\n${signIn}`,
      };
    case 'new_lead':
      return {
        subject: `New lead: ${p.full_name ?? 'enquiry'}`,
        text:
          `A new lead has arrived in the approval queue.\n\n` +
          `Name: ${p.full_name ?? '?'}\n` +
          (p.job_hint ? `Wants: ${p.job_hint}\n` : '') +
          `\nReview it at ${SITE_URL}/admin/leads — publish it as a job or dismiss it.`,
      };
    case 'booked_flag':
      return {
        subject: `Booked-in-window: ${title}`,
        text:
          `A paid member has marked "${title}" as booked during the exclusive window. ` +
          `Review it at ${SITE_URL}/admin/jobs and withdraw the job to confirm.`,
      };
    case 'application_approved':
      return {
        subject: `You’re approved — welcome to the network`,
        text:
          `Your application has been approved. You’ll now be emailed when a job is ` +
          `posted in one of your counties.\n\n` +
          `Sign in to see the job board: ${SITE_URL}/jobs`,
      };
    default:
      return { subject: 'Emmerdale Agriculture', text: 'You have a notification.' };
  }
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'onboarding@resend.dev';
  const admins = (Deno.env.get('ADMIN_EMAILS') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500 });
  }

  const { data: pending } = await supabase
    .from('pending_emails')
    .select('id, kind, to_email, payload, attempts')
    .eq('status', 'pending')
    .limit(BATCH);

  let sent = 0, failed = 0, retried = 0;

  for (const e of (pending ?? []) as PendingEmail[]) {
    const to = e.to_email === '__admin__' ? admins[0] : e.to_email;
    if (!to) {
      await supabase.from('pending_emails').update({ status: 'failed' }).eq('id', e.id);
      failed++;
      continue;
    }
    const { subject, text } = render(e.kind, e.payload ?? {});
    let success = false;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text }),
      });
      success = res.ok;
    } catch {
      success = false;
    }

    if (success) {
      await supabase
        .from('pending_emails')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', e.id);
      sent++;
    } else {
      const attempts = (e.attempts ?? 0) + 1;
      await supabase
        .from('pending_emails')
        .update({ attempts, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending' })
        .eq('id', e.id);
      attempts >= MAX_ATTEMPTS ? failed++ : retried++;
    }
  }

  return new Response(
    JSON.stringify({ processed: (pending ?? []).length, sent, retried, failed }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
