'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/form';
import { requireBooksWriter } from '@/lib/books/server';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { currentEmail, oauthReady, oauthUrl, onboardingLink, OAUTH_COOKIE } from '@/lib/books/stripeConnect';
import { syncLedgerStripe } from '@/lib/books/stripeSync';
import { stripeConfigured } from '@/lib/stripe';

/** Start or continue Stripe's own onboarding for the contractor's account. */
export async function connectStripeAction(): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  if (!stripeConfigured()) return { error: 'Card payments aren’t available yet.' };
  let url: string;
  try {
    url = await onboardingLink(gate.ledger, await currentEmail());
  } catch (err) {
    console.error('[books] stripe onboarding failed', err instanceof Error ? err.message : err);
    return { error: 'Stripe couldn’t be reached. Please try again.' };
  }
  redirect(url);
}

/** Link a Stripe account the business already has: off to Stripe to sign in and agree. */
export async function linkStripeAction(): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  if (!oauthReady()) return { error: 'Linking an existing Stripe account isn’t available yet.' };
  // Checked when Stripe sends them back, so the link can't be started by someone else.
  const state = randomBytes(24).toString('hex');
  (await cookies()).set(OAUTH_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/books/stripe-oauth', maxAge: 900 });
  redirect(oauthUrl(state));
}

/** Pull fees, payouts and refunds from Stripe now (also runs every night). */
export async function syncStripeAction(): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger?.stripe_account_id) return { error: 'Connect Stripe first.' };
  try {
    const r = await syncLedgerStripe(gate.ledger);
    revalidatePath('/account/books', 'layout');
    return { ok: true, message: r.posted ? `${r.posted} new entr${r.posted === 1 ? 'y' : 'ies'} from Stripe.` : 'Up to date: nothing new from Stripe.' };
  } catch (err) {
    console.error('[books] stripe sync failed', err instanceof Error ? err.message : err);
    return { error: 'Stripe couldn’t be reached. Please try again.' };
  }
}
