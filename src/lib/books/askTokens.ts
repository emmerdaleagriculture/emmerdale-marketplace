/**
 * Ask tokens: what a Premium member spends to ask a question of their books
 * and business. One question, one token. A free allowance arrives once a
 * year and lapses a year later; bought packs and gifts don't lapse. The
 * counting lives in the database (20261124120000_ask_tokens.sql); this is the
 * client-safe part: the amounts, and reading a balance out of the lots.
 */

/** Free tokens a Premium member gets each year. */
export const FREE_TOKENS_PER_YEAR = 100;

/** The top-up pack. */
export const TOKEN_PACK = { tokens: 100, pence: 1500 } as const;

export type TokenLot = {
  kind: string;
  tokens: number;
  remaining: number;
  expires_at: string | null;
};

export type TokenBalance = {
  /** Everything that can be spent now. */
  total: number;
  /** Left of this year's free allowance. */
  free: number;
  /** Left of packs and gifts, which don't lapse. */
  kept: number;
  /** When the free allowance lapses, if any of it is left. */
  freeExpires: string | null;
};

/** What's spendable now: lots with tokens left that haven't lapsed. */
export function balanceOf(lots: TokenLot[], now = Date.now()): TokenBalance {
  const live = lots.filter((l) => l.remaining > 0 && (!l.expires_at || new Date(l.expires_at).getTime() > now));
  const lapsing = live.filter((l) => l.expires_at);
  const free = lapsing.reduce((t, l) => t + l.remaining, 0);
  const kept = live.filter((l) => !l.expires_at).reduce((t, l) => t + l.remaining, 0);
  const freeExpires = lapsing.map((l) => l.expires_at!).sort()[0] ?? null;
  return { total: free + kept, free, kept, freeExpires };
}

/** The `kind` a pack's Checkout session and payment carry in their metadata. */
export const PACK_KIND = 'ask_token_pack';

/** The parts of a Stripe Checkout session a pack grant is decided on. */
export type PackSession = {
  id: string;
  mode: string | null;
  payment_status: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
  payment_intent: string | { id: string } | null;
};

/**
 * Whether this Checkout session is a paid-for token pack, and for whom. The
 * tokens come from our own pack, never from the session: the amount paid has
 * to be the pack's price, so an edited or stale session can't mint tokens.
 */
export function packToGrant(session: PackSession): { contractorId: string; tokens: number; sessionId: string; paymentIntentId: string | null } | null {
  if (session.mode !== 'payment' || session.metadata?.kind !== PACK_KIND) return null;
  if (session.payment_status !== 'paid') return null;
  if (session.amount_total !== TOKEN_PACK.pence || session.currency?.toLowerCase() !== 'gbp') return null;
  const contractorId = session.metadata.contractor_id;
  if (!contractorId) return null;
  const pi = session.payment_intent;
  return { contractorId, tokens: TOKEN_PACK.tokens, sessionId: session.id, paymentIntentId: typeof pi === 'string' ? pi : (pi?.id ?? null) };
}
