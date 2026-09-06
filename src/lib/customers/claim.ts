import { createServiceRoleClient } from '@/lib/supabase/server';

export type ClaimOutcome =
  | { ok: true; alsoClaimed: number }
  | { ok: false; reason: 'already_claimed' | 'invalid' | 'failed' };

/**
 * Attach a job to an account.
 *
 * The token is the proof. Signing up cannot be trusted to prove an email
 * address on this project (auth runs with autoconfirm on), so the claim is
 * anchored to something the customer demonstrably holds: the link that was
 * emailed to them, or the job they sent minutes ago.
 *
 * Shared by the button on the job page and by signup off the thank-you page,
 * because the thank-you page promises that choosing a password saves the job —
 * a promise it can only keep if signing up does the claim itself.
 */
export async function claimJobForUser(
  userId: string,
  userEmail: string | null | undefined,
  token: string,
): Promise<ClaimOutcome> {
  const admin = createServiceRoleClient();

  const { data: js } = await admin
    .from('job_submissions')
    .select('contact_name, contact_phone, contact_email')
    .eq('client_token', token)
    .maybeSingle();

  const { data: existing } = await admin
    .from('customers')
    .select('contact_name, phone')
    .eq('id', userId)
    .maybeSingle();

  // Fill gaps, never overwrite: claiming a second job whose contact fields are
  // blank must not wipe the name and phone the first one supplied.
  const { error: customerError } = await admin.from('customers').upsert(
    {
      id: userId,
      email: userEmail ?? js?.contact_email ?? '',
      contact_name: existing?.contact_name ?? js?.contact_name ?? null,
      phone: existing?.phone ?? js?.contact_phone ?? null,
    },
    { onConflict: 'id' },
  );
  if (customerError) {
    // Unread, this surfaced later as a foreign-key failure on the claim, which
    // says nothing about what actually went wrong.
    console.error('[customer] upsert failed:', customerError);
    return { ok: false, reason: 'failed' };
  }

  const { data, error } = await admin.rpc('claim_submission_for_customer', {
    p_token: token,
    p_customer_id: userId,
  });
  if (error) {
    console.error('[customer] claim failed:', error);
    return { ok: false, reason: 'failed' };
  }

  const res = data as { ok: boolean; reason?: string; also_claimed?: number };
  if (!res.ok) {
    return { ok: false, reason: res.reason === 'already_claimed' ? 'already_claimed' : 'invalid' };
  }
  return { ok: true, alsoClaimed: res.also_claimed ?? 0 };
}

/** The line the customer reads after a successful claim. */
export function claimMessage(alsoClaimed: number): string {
  return alsoClaimed > 0
    ? `Saved. ${alsoClaimed} earlier job${alsoClaimed === 1 ? '' : 's'} at this address came with it.`
    : 'Saved to your account.';
}
