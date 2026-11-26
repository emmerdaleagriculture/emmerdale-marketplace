import { notifyAdmins } from '@/lib/adminNotify';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';
import { OFF_PLATFORM } from './clientNote';
import { billedTier } from '@/lib/membership';

export type FlagRule = 'off_platform' | 'phone' | 'email_or_link' | 'postcode';
export type FlagSurface = 'quote note' | 'extra-work proposal' | 'message';

/**
 * A refused note or message, on the record (platform_flags,
 * 20261001160000). Which rule refused it and where — never the words. It is
 * what a contractor's standing is marked down for, so it must be written
 * even when the email below is not. Never throws.
 */
export async function recordRefusal(args: {
  rule: FlagRule;
  surface: FlagSurface;
  sender: 'contractor' | 'customer';
  submissionId: string | null | undefined;
  contractorId?: string | null;
}): Promise<void> {
  const { error } = await createServiceRoleClient().from('platform_flags').insert({
    rule: args.rule,
    surface: args.surface,
    sender: args.sender,
    submission_id: args.submissionId ?? null,
    contractor_id: args.contractorId ?? null,
  });
  if (error) console.error('[sq] platform flag not recorded:', error.message);
}

/** An attempt this long after an earlier one is a second offence, not the same one reworded. */
export const SECOND_ATTEMPT_AFTER_HOURS = 24;

/** Whether an attempt now is a second offence, given when the earlier refusals were recorded. */
export function isSecondAttempt(earlier: string[], now = Date.now()): boolean {
  const cutoff = now - SECOND_ATTEMPT_AFTER_HOURS * 3_600_000;
  return earlier.some((t) => new Date(t).getTime() <= cutoff);
}

/**
 * The second time a contractor tries to pass contact details or take a job
 * off the site: from now on pricing a job, or writing to a customer before
 * award, needs a paid membership (contractors.paid_only_since; enforced by
 * contractor_paid_only in submit_contractor_quote and sq_post_message,
 * 20261126200000). They keep receiving jobs. Call it after the refusal is
 * recorded. Returns whether the restriction is in force for them now: set
 * here or earlier, and not already met by a membership. Never throws.
 */
export async function strikeAfterAttempt(args: {
  contractorId: string | null | undefined;
  submissionId?: string | null;
}): Promise<boolean> {
  if (!args.contractorId) return false;
  try {
    const admin = createServiceRoleClient();
    const [{ data: ct }, { data: flags }, { data: member }] = await Promise.all([
      admin.from('contractors').select('business_name, email, paid_only_since').eq('id', args.contractorId).maybeSingle(),
      admin
        .from('platform_flags')
        .select('created_at')
        .eq('contractor_id', args.contractorId)
        .eq('sender', 'contractor')
        .order('created_at')
        .limit(50),
      admin.rpc('contractor_is_premium', { p_contractor_id: args.contractorId }),
    ]);
    if (!ct) return false;
    const paying = member === true;
    if (ct.paid_only_since) return !paying;
    if (!isSecondAttempt((flags ?? []).map((f) => f.created_at))) return false;
    // Of two refusals in flight at once, only the one whose update lands tells anyone.
    const { data: won, error } = await admin
      .from('contractors')
      .update({ paid_only_since: new Date().toISOString() })
      .eq('id', args.contractorId)
      .is('paid_only_since', null)
      .select('id');
    if (error) {
      console.error('[sq] second attempt: restriction not set:', error.message);
      return false;
    }
    if (!won?.length) return !paying;
    const who = ct.business_name || ct.email || 'A contractor';
    await Promise.all([
      // A member already has what it asks for: it bites only if they leave.
      !paying && ct.email
        ? admin
            .from('pending_emails')
            .insert({ kind: 'sq_paid_only', to_email: ct.email, payload: { business_name: ct.business_name ?? null } })
            .then(({ error: qErr }) => {
              if (qErr) console.error('[sq] paid-only email not queued:', qErr.message);
            })
        : Promise.resolve(),
      notifyAdmins(
        `Second contact attempt: ${who} now needs a paid account to price`,
        [
          `${who} has tried a second time to pass contact details or take a job off the site.`,
          paying
            ? 'They hold a paid membership, so nothing changes for them unless it ends.'
            : 'They still receive jobs, but can’t price them or message customers before award until they take a paid membership. They have been emailed.',
          '',
          `To lift it: ${siteUrl()}/admin/contractors/${args.contractorId}#warning`,
          args.submissionId ? `Job: ${siteUrl()}/admin/submissions/${args.submissionId}#messages` : '',
        ].join('\n'),
      ),
    ]);
    return !paying;
  } catch (err) {
    console.error('[sq] second attempt check failed:', err);
    return false;
  }
}

/** How long a contractor's messages are held for approval after one contact attempt. */
const HOLD_DAYS = 30;

/**
 * A contractor tried to get a contact detail or another channel past the
 * message box before award. Refusing it was not enough on 5 Oct 2026: a
 * phone number was refused at 18:43 and the same number, disguised as two
 * model numbers, went through at 18:44 — and the job was arranged on
 * WhatsApp. From the first attempt their messages before award wait for an
 * admin (sq_post_message holds them while messages_moderated_until is in
 * the future), and admin gets the words. Never throws.
 */
export async function holdAfterContactAttempt(args: {
  rule: FlagRule;
  body: string;
  submissionId: string | null | undefined;
  contractorId: string | null | undefined;
}): Promise<{ paidOnly: boolean }> {
  if (!args.contractorId) return { paidOnly: false };
  const admin = createServiceRoleClient();
  // A second offence has its own email, which replaces the warning.
  const paidOnly = await strikeAfterAttempt({ contractorId: args.contractorId, submissionId: args.submissionId });
  const until = new Date(Date.now() + HOLD_DAYS * 86_400_000).toISOString();
  const { data: ct, error } = await admin
    .from('contractors')
    .select('business_name, email, messages_moderated_until')
    .eq('id', args.contractorId)
    .maybeSingle();
  if (error) console.error('[sq] contact attempt: contractor lookup failed:', error.message);
  const already = ct?.messages_moderated_until && ct.messages_moderated_until > until;
  if (!already) {
    const { error: upErr } = await admin
      .from('contractors')
      .update({ messages_moderated_until: until })
      .eq('id', args.contractorId);
    if (upErr) console.error('[sq] contact attempt: hold not set:', upErr.message);
  }
  const who = ct?.business_name || ct?.email || 'A contractor';
  // Independent, and both swallow their own failures: the contractor's
  // warning and admin's copy go out side by side rather than one after the
  // other on the path back to the browser.
  await Promise.all([
    paidOnly
      ? Promise.resolve()
      : warnContractor({
          contractorId: args.contractorId,
          email: ct?.email,
          businessName: ct?.business_name,
          rule: args.rule,
          // The hold in force, which an admin or an earlier attempt may have set
          // longer than this one would.
          until: already ? (ct.messages_moderated_until as string) : until,
        }),
    notifyAdmins(
      `Contact-detail attempt: ${who}, messages now held`,
      [
        `${who} tried to send a message before award that was refused (${args.rule.replace(/_/g, ' ')}).`,
        `Their messages before award are now held for your approval for ${HOLD_DAYS} days.`,
        '',
        `"${args.body}"`,
        '',
        args.submissionId ? `Job: ${siteUrl()}/admin/submissions/${args.submissionId}#messages` : '',
      ].join('\n'),
    ),
  ]);
  return { paidOnly };
}

/** One warning per contractor per this many days, however many attempts. */
const WARN_EVERY_DAYS = HOLD_DAYS;

/**
 * The contractor hears about it too (sq_contact_warning): what was refused
 * and why, that their messages are now checked, and the honest way to do
 * what they were trying to do — Open membership puts the customer's details
 * on every invitation, so there is nothing to smuggle. An Open member never
 * gets here (the contact rules are off for them), so the invitation is to
 * move up, from free or from Premium.
 *
 * Once per WARN_EVERY_DAYS, by contractor: the guard is a conditional update
 * of contractors.contact_warned_at, so of two refusals in flight at once only
 * the one whose update returns the row sends, and a changed address does not
 * reset the clock. A failed lookup means no email — the point of the guard
 * is not to nag, and an error must not turn into a second copy. Never throws.
 */
async function warnContractor(args: {
  contractorId: string;
  email: string | null | undefined;
  businessName: string | null | undefined;
  rule: FlagRule;
  /** When the hold on their messages ends. */
  until: string;
}): Promise<void> {
  if (!args.email) return;
  const admin = createServiceRoleClient();
  const now = new Date();
  const since = new Date(now.getTime() - WARN_EVERY_DAYS * 86_400_000).toISOString();
  const [won, sub] = await Promise.all([
    admin
      .from('contractors')
      .update({ contact_warned_at: now.toISOString() })
      .eq('id', args.contractorId)
      .or(`contact_warned_at.is.null,contact_warned_at.lt.${since}`)
      .select('id'),
    // What Stripe bills them for, if anything: a paid Premium is told the
    // move is prorated; a comp or nothing is told the price.
    admin
      .from('subscriptions')
      .select('status, tier, plan, current_period_end, cancel_at_period_end')
      .eq('contractor_id', args.contractorId)
      .maybeSingle(),
  ]);
  if (won.error) {
    console.error('[sq] contact warning: guard failed:', won.error.message);
    return;
  }
  if (!won.data?.length) return;
  if (sub.error) console.error('[sq] contact warning: subscription lookup failed:', sub.error.message);
  const billed = sub.error ? null : billedTier(sub.data);
  if (billed === 'open') return;
  const { error } = await admin.from('pending_emails').insert({
    kind: 'sq_contact_warning',
    to_email: args.email,
    payload: {
      business_name: args.businessName ?? null,
      rule: args.rule,
      held_until: args.until,
      billed_premium: billed === 'premium',
    },
  });
  if (error) console.error('[sq] contact warning not queued:', error.message);
}

/**
 * Tells admin when someone tries to arrange payment outside the platform,
 * and records it.
 *
 * The forms refuse the words (clientNote.ts OFF_PLATFORM), and a refused note
 * or message is never stored, so until 2026-10-01 this email was the only
 * record that it was tried; now platform_flags holds the fact of it too. Whoever tried once may try again by phone once contact details are
 * passed on — which is the conversation admin needs to have.
 *
 * Call it with whatever text was just refused; it does nothing unless the
 * text actually matches, so callers need not know which rule refused it.
 * Never throws: notifyAdmins swallows its own failures, and a lookup that
 * fails just leaves the name out.
 */
export async function flagOffPlatform(args: {
  text: string | string[];
  where: FlagSurface;
  sender: 'contractor' | 'customer';
  submissionId: string | null | undefined;
  contractorId?: string | null;
}): Promise<void> {
  const texts = (Array.isArray(args.text) ? args.text : [args.text]).filter((t) => OFF_PLATFORM.test(t));
  if (texts.length === 0) return;
  await recordRefusal({
    rule: 'off_platform',
    surface: args.where,
    sender: args.sender,
    submissionId: args.submissionId,
    contractorId: args.contractorId,
  });
  if (args.sender === 'contractor') await strikeAfterAttempt({ contractorId: args.contractorId, submissionId: args.submissionId });

  let who = args.sender === 'customer' ? 'The customer' : 'A contractor';
  if (args.contractorId) {
    const { data } = await createServiceRoleClient()
      .from('contractors')
      .select('business_name, email')
      .eq('id', args.contractorId)
      .maybeSingle();
    if (data) who = data.business_name || data.email || who;
  }

  await notifyAdmins(
    `Off-platform payment attempt: ${args.sender === 'customer' ? 'customer' : who}`,
    [
      `${who} tried to send a ${args.where} that mentions paying outside the platform. ` +
        'It was refused and has not been stored or shown to anyone; they were asked to reword it.',
      '',
      ...texts.map((t) => `"${t}"`),
      '',
      args.submissionId ? `Job: ${siteUrl()}/admin/submissions/${args.submissionId}` : '',
    ]
      .filter((l, i, all) => l !== '' || all[i - 1] !== '')
      .join('\n'),
  );
}
