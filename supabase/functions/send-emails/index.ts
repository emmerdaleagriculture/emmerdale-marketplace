// Edge Function: drain the pending_emails queue via Resend (spec §4, §8).
//
// State transitions (open_due_jobs / sealed-quote RPCs / admin actions) only
// ever INSERT into pending_emails — never make network calls. This function,
// run on a schedule (pg_cron → pg_net), does the sending, so the DB stays
// fast and transactional.
//
// Guarded by an x-cron-secret header (verify_jwt = false in config.toml) so the
// scheduler can call it without a user JWT. Transient/DNS failures keep the row
// 'pending' and increment attempts; after MAX_ATTEMPTS it becomes 'failed'.
//
// TEST MODE (sealed-quote funnel): while app_config.sq_test_contractor_allowlist
// is a non-empty array, contractor-facing sq_* emails to any other address are
// redirected to the first allowlisted address with the original recipient
// stamped in the subject. Matching already filters at distribution; this is the
// belt-and-braces layer so no code path can spam a real contractor during
// testing.

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
// Inbound reply domain for invitation reply-parsing (§17). Unset = no reply_to
// (replies go nowhere special) until the Resend inbound MX is verified.
const REPLY_DOMAIN = (Deno.env.get('SQ_INBOUND_REPLY_DOMAIN') ?? '').trim();

// Kinds addressed to contractors within the sealed-quote funnel — the set the
// test-mode redirect applies to. (Open-access kinds like new_job belong to the
// live board and are untouched.)
const SQ_CONTRACTOR_KINDS = new Set(['sq_invitation', 'sq_award_won', 'sq_award_lost', 'sq_quote_confirm']);

/** "£1,250" / "£1,252.50" from pence. */
function gbp(pence: unknown): string {
  const n = Number(pence ?? 0);
  const pounds = Math.floor(n / 100);
  const rem = n % 100;
  const grouped = pounds.toLocaleString('en-GB');
  return rem ? `£${grouped}.${String(rem).padStart(2, '0')}` : `£${grouped}`;
}

function areaLine(p: Record<string, unknown>): string {
  if (p.area_mapped_value) return `${p.area_mapped_value} acres (measured from a drawn boundary)`;
  if (p.area_value) return `${p.area_value} ${p.area_unit === 'linear_m' ? 'metres' : p.area_unit ?? ''}`;
  return 'not stated';
}

/**
 * HTML twin of the plain-text body. Escapes the text, turns URLs into real
 * anchors, keeps the text version as the fallback part.
 */
function toHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linked = escaped.replace(
    /https?:\/\/[^\s]+/g,
    (url) => `<a href="${url}" style="color:#2f6f3e;">${url}</a>`,
  );
  return (
    `<div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;` +
    `font-size:15px;line-height:1.65;color:#1f2a1f;max-width:560px;">` +
    linked.replace(/\n/g, '<br>') +
    `</div>`
  );
}

// Returns null for an unknown kind: the row is marked failed immediately. A
// typo'd kind used to send a useless generic email — silently.
function render(kind: string, p: Record<string, unknown>): { subject: string; text: string } | null {
  const title = String(p.title ?? 'a job');
  const where = [p.town, p.postcode_district].filter(Boolean).join(', ') || String(p.county ?? '');
  const jobLink = p.job_id ? `${SITE_URL}/jobs/${p.job_id}` : `${SITE_URL}/jobs`;
  const signIn = `Sign in to view it: ${jobLink}`;
  const first = p.contact_name ? String(p.contact_name).split(/\s+/)[0] : 'there';
  const portal = `${SITE_URL}/my/${p.client_token ?? ''}`;
  const gbp = (pence: unknown) =>
    typeof pence === 'number' ? `£${(pence / 100).toFixed(2)}` : '—';

  switch (kind) {
    // ── Open-access board (existing) ──────────────────────────────────────
    case 'new_job':
      return {
        subject: `New job in your area: ${title}`,
        text:
          `A new job has been posted in one of your counties.\n\n` +
          `${title}\n${where}\n\n` +
          `Open it to see the full details and the customer's contact — the ` +
          `customer chooses who they hire, so it pays to get in touch early.\n\n${signIn}`,
      };
    case 'exclusive_new':
      return {
        subject: `Exclusive access (12h head start): ${title}`,
        text:
          `As a paid member you get first access to this new job${where ? ` in ${where}` : ''}, ` +
          `before it opens to the rest of the network.\n\n` +
          `${title}\n\nGet in touch with the customer before anyone else.\n\n${signIn}`,
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

    // ── Sealed-quote funnel: contractor-facing ────────────────────────────
    case 'sq_invitation': {
      const dist = p.distance_miles != null ? ` (${p.distance_miles} miles from your base)` : '';
      return {
        subject: `Job to price: ${p.service ?? 'land work'}, ${p.county ?? ''}${dist}`,
        text:
          `A job in your area needs pricing.\n\n` +
          `In their words: “${p.description ?? '—'}”\n\n` +
          (p.service ? `Work:      ${p.service}\n` : '') +
          `Area:      ${areaLine(p)}\n` +
          `Where:     ${p.postcode_district ?? '—'}, ${p.county ?? ''} — the full address comes if you win the job\n` +
          `When:      ${p.urgency ?? 'not stated'}${p.target_date ? ` (by ${p.target_date})` : ''}\n` +
          (p.gate_width ? `Access:    ${p.gate_width} gate\n` : '') +
          (p.access_notes ? `Notes:     ${p.access_notes}\n` : '') +
          (p.obstacles ? `Obstacles: ${p.obstacles}\n` : '') +
          `\nFirst come, first served: the customer sees prices as they arrive and can ` +
          `accept at any moment. Price it within 7 days — but the sooner you price, ` +
          `the better your chances.\n\n` +
          `Price it or pass (one tap): ${SITE_URL}/quote/${p.token}\n\n` +
          `Photos, a satellite view of the drawn boundary and the full spec are on that page.`,
      };
    }
    case 'sq_award_won':
      return {
        subject: `You’ve got the job — ${p.service ?? 'land work'}`,
        text:
          `The customer accepted your price and has paid in full. The money is held ` +
          `by Emmerdale and released to you when the work is done.\n\n` +
          `Customer:  ${p.contact_name ?? '—'}\n` +
          `Phone:     ${p.contact_phone ?? '—'}\n` +
          `Email:     ${p.contact_email ?? '—'}\n` +
          `Postcode:  ${p.postcode ?? '—'}\n` +
          (p.gate_w3w ? `Gate:      ///${p.gate_w3w}\n` : '') +
          `Your price: ${gbp(p.contractor_price_pence)}\n\n` +
          `Contact them within 24 hours to arrange the work, and log that you have ` +
          `here: ${SITE_URL}/won`,
      };
    case 'sq_award_lost':
      return {
        subject: `Job taken: ${p.service ?? 'land work'}, ${p.postcode_district ?? ''}`,
        text:
          `The customer went with another price on this one — with first-come jobs, ` +
          `that happens. Thanks for pricing it; we’ll send you the next job in your area.`,
      };
    case 'sq_quote_confirm':
      return {
        subject: `Confirm your price: ${gbp(p.amount_pence)} for ${p.service ?? 'the job'}`,
        text:
          `We read your reply as a price of ${gbp(p.amount_pence)} for the ` +
          `${p.service ?? ''} job in ${p.postcode_district ?? 'your area'}.\n\n` +
          `It won’t be shown to the customer until you confirm it:\n` +
          `${SITE_URL}/quote/confirm/${p.confirm_token}\n\n` +
          `If that figure’s wrong, use your pricing link instead and it will replace this one.`,
      };

    // ── Sealed-quote funnel: client-facing ────────────────────────────────
    case 'sq_portal_link':
      return {
        subject: `Your job page`,
        text:
          `Hi ${first},\n\nThis is your job page — prices from contractors will appear ` +
          `there as they come in:\n${portal}\n\n` +
          `Keep this email; the link is your key to the page.`,
      };
    case 'sq_first_quote':
      return {
        subject: `Your first price is in — ${gbp(p.client_price_pence)}`,
        text:
          `Hi ${first},\n\nA contractor (${p.contractor_label ?? 'Contractor A'}) has priced your ` +
          `${p.service ?? ''} job at ${gbp(p.client_price_pence)}.\n\n` +
          `More may follow — see them all and choose here:\n${portal}\n\n` +
          `Nothing is booked until you accept a price and pay.`,
      };
    case 'sq_new_quotes':
      return {
        subject: `${p.new_count} new price${Number(p.new_count) === 1 ? '' : 's'} on your job`,
        text:
          `Hi ${first},\n\nYour job now has ${p.total_count} price${Number(p.total_count) === 1 ? '' : 's'} ` +
          `to choose from (${p.new_count} new since we last emailed).\n\n` +
          `See them all here:\n${portal}`,
      };
    case 'sq_payment_link':
      return {
        subject: `Complete your booking — ${gbp(p.amount_pence)}`,
        text:
          `Hi ${first},\n\nYou’ve accepted a price of ${gbp(p.amount_pence)} from ` +
          `${p.contractor_label ?? 'your chosen contractor'}.\n\n` +
          `Pay here to confirm the booking:\n${p.checkout_url}\n\n` +
          `The link is valid for 24 hours. Your money is held by Emmerdale and only ` +
          `released to the contractor when the work is done.\n\n` +
          `Your job page: ${portal}`,
      };
    case 'sq_payment_expired':
      return {
        subject: `That payment link expired — nothing was booked`,
        text:
          `Hi ${first},\n\nThe payment link for ${p.contractor_label ?? 'your chosen contractor'} ` +
          `ran out before payment went through, so nothing was booked and no money was taken.\n\n` +
          `Your prices are still here — accept again whenever you’re ready:\n${portal}`,
      };
    case 'sq_award_client':
      return {
        subject: `Booked — ${p.contractor_business_name ?? 'your contractor'} has your job`,
        text:
          `Hi ${first},\n\nAll confirmed: ${p.contractor_business_name ?? 'your contractor'} has ` +
          `your job and you’ve paid in full. We hold the money and release it to them ` +
          `when the work is done.\n\n` +
          `They’ll be in touch within 24 hours to arrange it. Track everything here:\n${portal}`,
      };
    case 'sq_no_matches':
      if (p.supply_gap) {
        return {
          subject: `SUPPLY GAP: no contractors for ${p.service ?? '?'} in ${p.county ?? '?'}`,
          text:
            `A paid submission had zero matching contractors.\n\n` +
            `Service: ${p.service ?? '—'}\nCounty:  ${p.county ?? '—'}\n\n` +
            `This is the recruitment list talking. Review: ${SITE_URL}/admin/submissions`,
        };
      }
      return {
        subject: `About your ${p.service ?? ''} job`,
        text:
          `Hi ${first},\n\nWe don’t currently have contractors covering ${p.county ?? 'your area'} ` +
          `for this kind of work, so we can’t take your job forward right now. We’re ` +
          `sorry — coverage is growing, and we’ll let you know if that changes.`,
      };
    case 'sq_no_quotes_yet':
      if (p.submission_id) {
        return {
          subject: `48h, no prices yet: ${p.county ?? '?'}`,
          text:
            `A distributed job has had no prices for 48 hours.\n\n` +
            `Review: ${SITE_URL}/admin/submissions/${p.submission_id}`,
        };
      }
      return {
        subject: `Your job is still out with contractors`,
        text:
          `Hi ${first},\n\nJust so you know where things stand: your ${p.service ?? ''} job ` +
          `is with contractors in ${p.county ?? 'your area'}, but none has priced it yet. ` +
          `That’s usually about their diaries, not your job — prices can arrive at any ` +
          `time over the next few days.\n\nYour job page: ${portal}`,
      };
    case 'sq_no_quotes_closed':
      return {
        subject: `About your ${p.service ?? ''} job`,
        text:
          `Hi ${first},\n\nWe put your job to ${p.invited ?? 'several'} contractor` +
          `${Number(p.invited) === 1 ? '' : 's'} in ${p.county ?? 'your area'}, but none ` +
          `priced it within the week, so it has now closed. That’s usually timing or ` +
          `distance, not your job.\n\nYou’re welcome to post it again: ${SITE_URL}/start`,
      };
    case 'sq_rating_request':
      return {
        subject: `How did ${p.contractor_business_name ?? 'the contractor'} do?`,
        text:
          `Hi ${first},\n\nYour job is complete and ${p.contractor_business_name ?? 'the contractor'} ` +
          `has been paid. If you’ve got 30 seconds, a rating helps the next customer:\n` +
          `${portal}/rate`,
      };

    case 'sq_completion_confirm':
      return {
        subject: `${p.contractor_business_name ?? 'Your contractor'} says your job is done`,
        text:
          `Hi ${first},\n\n${p.contractor_business_name ?? 'Your contractor'} has marked your ` +
          `job as finished. Have a look, and if you're happy, confirm it — that's what ` +
          `releases their payment:\n${portal}\n\n` +
          `If it isn't finished, don't confirm. Reply to this email and we'll sort it out.`,
      };

    case 'sq_completion_confirmed':
      return {
        subject: `Job confirmed complete — your payment is released`,
        text:
          `${p.contact_name ?? 'The customer'} has confirmed the work is done, so your ` +
          `payment is released and on its way.\n\nYour won jobs: ${SITE_URL}/won`,
      };

    case 'sq_job_cancelled_contractor':
      return {
        subject: `Job cancelled — ${p.contact_name ?? 'the customer'}`,
        text:
          `${p.contact_name ?? 'The customer'} has cancelled the job you were booked ` +
          `for, before work started. You don't need to do anything, and nothing is ` +
          `owed by you.\n\nIf you'd already set aside a date, let us know — we'll ` +
          `look at what else is going out in your area.\n\n${SITE_URL}/won`,
      };

    // ── Sealed-quote funnel: operator alerts ──────────────────────────────
    case 'sq_unmatched_needs_classification':
      return {
        subject: `Submission needs a service classification`,
        text:
          `A paid submission confirmed with no matched service, so it can’t be ` +
          `distributed. In their words: “${p.service_verbatim ?? '—'}”.\n\n` +
          `Classify it: ${SITE_URL}/admin/submissions/${p.submission_id}`,
      };
    case 'sq_job_cancelled_admin':
      return {
        subject: `Cancelled after payment — refund due`,
        text:
          `A customer cancelled a paid job on their job page (terms 9.1).\n\n` +
          `Refunded to them: ${gbp(p.refund_pence)}\n` +
          `Retained (15% fee):  ${gbp(p.fee_pence)}\n\n` +
          `The Stripe refund was requested automatically — check it cleared, and ` +
          `that the contractor has been stood down.\n` +
          `${SITE_URL}/admin/submissions/${p.submission_id}`,
      };

    case 'sq_payment_needs_refund':
      return {
        subject: `MANUAL REFUND NEEDED: payment into a closed job`,
        text:
          `A client payment (${gbp(p.amount_pence)}) cleared for a job that is no ` +
          `longer awardable (status: ${p.job_status ?? '?'}). Nothing was awarded; ` +
          `the money is held.\n\n` +
          `Decide and refund manually in Stripe. Session: ${p.session_id ?? '—'}\n` +
          `Submission: ${SITE_URL}/admin/submissions/${p.submission_id}`,
      };

    default:
      return null; // unknown kind → fail loudly (marked failed, no retries)
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

  // Test-mode allowlist for sealed-quote contractor emails (read once per drain).
  let sqAllowlist: string[] = [];
  try {
    const { data } = await supabase
      .from('app_config').select('value').eq('key', 'sq_test_contractor_allowlist').maybeSingle();
    if (Array.isArray(data?.value)) sqAllowlist = data.value.map((v: unknown) => String(v).toLowerCase());
  } catch { /* table may not exist yet — no redirect */ }

  const { data: pending } = await supabase
    .from('pending_emails')
    .select('id, kind, to_email, payload, attempts')
    .eq('status', 'pending')
    .limit(BATCH);

  let sent = 0, failed = 0, retried = 0;

  for (const e of (pending ?? []) as PendingEmail[]) {
    let to = e.to_email === '__admin__' ? admins[0] : e.to_email;
    if (!to) {
      await supabase.from('pending_emails').update({ status: 'failed' }).eq('id', e.id);
      failed++;
      continue;
    }

    const rendered = render(e.kind, e.payload ?? {});
    if (!rendered) {
      // Unknown kind: a bug, not a retry candidate.
      await supabase.from('pending_emails').update({ status: 'failed' }).eq('id', e.id);
      failed++;
      continue;
    }
    let { subject } = rendered;
    const { text } = rendered;

    // TEST MODE redirect (sealed-quote contractor kinds only).
    if (
      sqAllowlist.length > 0 &&
      SQ_CONTRACTOR_KINDS.has(e.kind) &&
      !sqAllowlist.includes(to.toLowerCase())
    ) {
      subject = `[TEST — was: ${to}] ${subject}`;
      to = sqAllowlist[0];
    }

    // Invitation replies route back through the inbound parser when the
    // reply domain is live (§17).
    const replyTo =
      e.kind === 'sq_invitation' && REPLY_DOMAIN && e.payload?.token
        ? `quotes+${e.payload.token}@${REPLY_DOMAIN}`
        : undefined;

    let success = false;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to, subject, text, html: toHtml(text),
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
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
