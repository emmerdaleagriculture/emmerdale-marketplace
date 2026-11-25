'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAsker, requireBooksWriter } from '@/lib/books/server';
import type { AskActionView } from '@/lib/books/askActions';
import { cancelAction, confirmAction } from '@/lib/books/askActions.server';
import { isAppRequest } from '@/lib/appMode.server';
import { packCheckoutUrl } from '@/lib/books/askPacks.server';

/** Buy a token pack: off to Stripe Checkout, back to the Ask page. Not offered inside the phone apps. */
export async function buyPackAction() {
  const asker = await requireAsker();
  if (!asker.ok || (await isAppRequest())) redirect('/account/books/ask');
  let url: string;
  try {
    url = await packCheckoutUrl(asker.userId);
  } catch (err) {
    console.error('[ask] pack checkout failed', err instanceof Error ? err.message : err);
    redirect('/account/books/ask?pack=failed');
  }
  redirect(url);
}

export type ActionReply = { ok: true; action: AskActionView } | { ok: false; error: string };

/**
 * Confirm a change Ask prepared: it is checked again and recorded in the
 * member's own books. Only the member who asked, while they can ask and can
 * write to their books.
 */
export async function confirmAskActionAction(actionId: number): Promise<ActionReply> {
  const asker = await requireAsker();
  if (!asker.ok) return { ok: false, error: asker.error };
  const writer = await requireBooksWriter();
  if (!writer.ok) return { ok: false, error: writer.error };
  if (!writer.ledger) return { ok: false, error: 'Set up your books first.' };
  if (!Number.isSafeInteger(actionId)) return { ok: false, error: 'That change isn’t there any more.' };
  const action = await confirmAction(actionId, writer.userId, writer.ledger);
  if (!action) return { ok: false, error: 'That change isn’t there any more.' };
  if (action.status === 'done') revalidatePath('/account/books', 'layout');
  return { ok: true, action };
}

/** Turn down a change Ask prepared: nothing is recorded. */
export async function cancelAskActionAction(actionId: number): Promise<ActionReply> {
  const asker = await requireAsker();
  if (!asker.ok) return { ok: false, error: asker.error };
  if (!Number.isSafeInteger(actionId)) return { ok: false, error: 'That change isn’t there any more.' };
  const action = await cancelAction(actionId, asker.userId);
  return action ? { ok: true, action } : { ok: false, error: 'That change isn’t there any more.' };
}
