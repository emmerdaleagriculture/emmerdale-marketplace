import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadBooks } from '@/lib/books/server';
import { ensureFreeTokens, sweepStaleQuestions, tokenBalance } from '@/lib/books/askTokens.server';
import { FREE_TOKENS_PER_YEAR, TOKEN_PACK } from '@/lib/books/askTokens';
import { confirmPackReturn } from '@/lib/books/askPacks.server';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { buyPackAction } from './actions';
import m from '../../market/market.module.css';
import { BooksFrame } from '../BooksFrame';
import { AskPanel } from './AskPanel';

export const metadata: Metadata = { title: 'Ask', robots: { index: false, follow: false } };

const PACK_NOTICES: Record<string, string> = {
  added: `${TOKEN_PACK.tokens} tokens added. A receipt is on its way by email.`,
  pending: 'Your payment hasn’t been confirmed yet. If you paid, your tokens will appear here shortly.',
  cancelled: 'No payment was taken.',
  failed: 'We couldn’t start the payment just now. Please try again.',
};

/**
 * Ask: type a question about your books or your Emmerdale work and get the
 * answer worked out from your own records. One question, one token.
 */
export default async function AskPage({ searchParams }: { searchParams: Promise<{ pack?: string; session_id?: string }> }) {
  const access = await loadBooks('/account/books/ask');
  if (!access.ask) redirect('/account/books');

  // Back from Checkout: make sure the tokens are there before the page shows
  // (the webhook may not have landed), then drop the session id from the URL.
  const { pack, session_id: sessionId } = await searchParams;
  if (pack === 'paid' && sessionId) {
    let outcome = 'added';
    try {
      if ((await confirmPackReturn(access.userId, sessionId)) === 'not-a-pack') outcome = 'pending';
    } catch (err) {
      console.error('[ask] pack confirm failed', err instanceof Error ? err.message : err);
      outcome = 'pending';
    }
    redirect(`/account/books/ask?pack=${outcome}`);
  }
  const packNotice = pack ? PACK_NOTICES[pack] : undefined;

  // A question cut off earlier gives its token back before the balance is read.
  await sweepStaleQuestions(access.userId);
  await ensureFreeTokens(access.userId);
  const [balance, { data: past }] = await Promise.all([
    tokenBalance(access.userId),
    createServiceRoleClient()
      .from('ask_questions')
      .select('id, question, answer, created_at')
      .eq('contractor_id', access.userId)
      .eq('status', 'answered')
      .order('id', { ascending: false })
      .limit(10),
  ]);

  return (
    <BooksFrame access={access} title="Ask" tab="ask" crumb="Ask">
      <p className={m.lead}>
        Ask a question about your books or your Emmerdale work, in your own words. The answer is worked out
        from your own records. Each question uses one token; you get {FREE_TOKENS_PER_YEAR} free every year.
      </p>
      {packNotice && <p className={s.notice}>{packNotice}</p>}
      <AskPanel
        balance={balance}
        hasBooks={Boolean(access.ledger)}
        past={(past ?? []).flatMap((q) => (q.answer ? [{ id: q.id, question: q.question, answer: q.answer, at: q.created_at }] : []))}
      >
        {/* Not sold inside the phone apps: there it's the balance only. */}
        {!access.app && (
          <form action={buyPackAction} className={s.askTopUp}>
            <span>
              <b>Need more?</b> {TOKEN_PACK.tokens} tokens for £{TOKEN_PACK.pence / 100}. Bought tokens don’t expire.
            </span>
            <button type="submit" className={f.btnGhost}>
              Buy {TOKEN_PACK.tokens} tokens
            </button>
          </form>
        )}
      </AskPanel>
    </BooksFrame>
  );
}
