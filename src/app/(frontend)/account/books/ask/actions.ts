'use server';

import { redirect } from 'next/navigation';
import { requireAsker } from '@/lib/books/server';
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
