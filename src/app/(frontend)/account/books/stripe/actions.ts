'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/form';
import { requireBooksWriter } from '@/lib/books/server';
import { currentEmail, onboardingLink } from '@/lib/books/stripeConnect';
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

/** Pull fees, payouts and refunds from Stripe now (also runs every night). */
export async function syncStripeAction(): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger?.stripe_charges_enabled) return { error: 'Connect Stripe first.' };
  try {
    const r = await syncLedgerStripe(gate.ledger);
    revalidatePath('/account/books', 'layout');
    return { ok: true, message: r.posted ? `${r.posted} new entr${r.posted === 1 ? 'y' : 'ies'} from Stripe.` : 'Up to date: nothing new from Stripe.' };
  } catch (err) {
    console.error('[books] stripe sync failed', err instanceof Error ? err.message : err);
    return { error: 'Stripe couldn’t be reached. Please try again.' };
  }
}
