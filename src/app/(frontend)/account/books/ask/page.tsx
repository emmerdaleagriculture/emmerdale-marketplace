import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadBooks } from '@/lib/books/server';
import { ensureFreeTokens, tokenBalance } from '@/lib/books/askTokens.server';
import { FREE_TOKENS_PER_YEAR } from '@/lib/books/askTokens';
import m from '../../market/market.module.css';
import { BooksFrame } from '../BooksFrame';
import { AskPanel } from './AskPanel';

export const metadata: Metadata = { title: 'Ask', robots: { index: false, follow: false } };

/**
 * Ask: type a question about your books or your Emmerdale work and get the
 * answer worked out from your own records. One question, one token.
 */
export default async function AskPage() {
  const access = await loadBooks('/account/books/ask');
  if (!access.ask) redirect('/account/books');

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
      <AskPanel
        balance={balance}
        hasBooks={Boolean(access.ledger)}
        past={(past ?? []).flatMap((q) => (q.answer ? [{ id: q.id, question: q.question, answer: q.answer, at: q.created_at }] : []))}
      />
    </BooksFrame>
  );
}
