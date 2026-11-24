import { describe, expect, it } from 'vitest';
import { balanceOf, packToGrant, type PackSession } from './askTokens';

const NOW = Date.parse('2026-11-24T12:00:00Z');

describe('balanceOf', () => {
  it('is empty with no lots', () => {
    expect(balanceOf([], NOW)).toEqual({ total: 0, free: 0, kept: 0, freeExpires: null });
  });
  it('splits the free allowance from packs and gifts', () => {
    const b = balanceOf(
      [
        { kind: 'free', tokens: 100, remaining: 60, expires_at: '2027-11-24T12:00:00Z' },
        { kind: 'pack', tokens: 100, remaining: 100, expires_at: null },
        { kind: 'gift', tokens: 20, remaining: 5, expires_at: null },
      ],
      NOW,
    );
    expect(b).toEqual({ total: 165, free: 60, kept: 105, freeExpires: '2027-11-24T12:00:00Z' });
  });
  it('leaves out a lapsed allowance and spent lots', () => {
    const b = balanceOf(
      [
        { kind: 'free', tokens: 100, remaining: 40, expires_at: '2026-11-24T11:59:59Z' },
        { kind: 'pack', tokens: 100, remaining: 0, expires_at: null },
      ],
      NOW,
    );
    expect(b).toEqual({ total: 0, free: 0, kept: 0, freeExpires: null });
  });
});

describe('packToGrant', () => {
  const paid: PackSession = {
    id: 'cs_1',
    mode: 'payment',
    payment_status: 'paid',
    amount_total: 1500,
    currency: 'gbp',
    metadata: { kind: 'ask_token_pack', contractor_id: 'c1', tokens: '100000' },
    payment_intent: 'pi_1',
  };
  it('grants our pack, not whatever the session says', () => {
    expect(packToGrant(paid)).toEqual({ contractorId: 'c1', tokens: 100, sessionId: 'cs_1', paymentIntentId: 'pi_1' });
    expect(packToGrant({ ...paid, payment_intent: { id: 'pi_2' } })?.paymentIntentId).toBe('pi_2');
  });
  it('grants nothing unless it is a paid pack at the pack price', () => {
    expect(packToGrant({ ...paid, payment_status: 'unpaid' })).toBeNull();
    expect(packToGrant({ ...paid, amount_total: 1 })).toBeNull();
    expect(packToGrant({ ...paid, currency: 'usd' })).toBeNull();
    expect(packToGrant({ ...paid, mode: 'subscription' })).toBeNull();
    expect(packToGrant({ ...paid, metadata: { kind: 'sq_job_payment', contractor_id: 'c1' } })).toBeNull();
    expect(packToGrant({ ...paid, metadata: { kind: 'ask_token_pack' } })).toBeNull();
  });
});
