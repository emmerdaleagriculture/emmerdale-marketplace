import { createServiceRoleClient } from '@/lib/supabase/server';
import { balanceOf, FREE_TOKENS_PER_YEAR, type TokenBalance } from './askTokens';

/**
 * Server side of Ask tokens. Callers decide who may ask (a Premium member
 * with Ask released: `canEdit` from books/server.ts and askAllowed); these
 * only move tokens. Every function works on the contractor id it is given,
 * so pass the signed-in user's own.
 */

/** This year's free allowance, if it hasn't been given yet. Safe to call on every visit. */
export async function ensureFreeTokens(contractorId: string): Promise<void> {
  const { error } = await createServiceRoleClient().rpc('ask_tokens_grant_free', {
    p_contractor_id: contractorId,
    p_tokens: FREE_TOKENS_PER_YEAR,
  });
  if (error) console.error('[ask] free token grant failed', { contractorId, error: error.message });
}

export async function tokenBalance(contractorId: string): Promise<TokenBalance> {
  const { data, error } = await createServiceRoleClient()
    .from('ask_token_lots')
    .select('kind, tokens, remaining, expires_at')
    .eq('contractor_id', contractorId)
    .gt('remaining', 0);
  if (error) throw new Error(error.message);
  return balanceOf(data ?? []);
}

/** Spend one token on a question. Returns the question's id, or null when there are no tokens left. */
export async function takeToken(contractorId: string, question: string): Promise<number | null> {
  const { data, error } = await createServiceRoleClient().rpc('ask_tokens_take', {
    p_contractor_id: contractorId,
    p_question: question,
  });
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** The question got no answer: mark it failed and give the token back (once). */
export async function refundToken(questionId: number, reason: string): Promise<void> {
  const { error } = await createServiceRoleClient().rpc('ask_tokens_refund', { p_question_id: questionId, p_error: reason });
  if (error) console.error('[ask] token refund failed', { questionId, error: error.message });
}

/** Tokens given by an admin. They don't lapse. */
export async function giftTokens(contractorId: string, tokens: number, note: string | null): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from('ask_token_lots')
    .insert({ contractor_id: contractorId, kind: 'gift', tokens, remaining: tokens, note });
  if (error) throw new Error(error.message);
}
