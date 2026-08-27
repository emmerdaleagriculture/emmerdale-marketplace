import { describe, expect, it } from 'vitest';
import { ReplyParseSchema, stripReply } from './replyLlm';

describe('stripReply', () => {
  it('cuts quoted history and signatures', () => {
    const mail = `450 + vat, can do next week\n\nCheers, Dave\n\nOn Mon, 1 Sep 2026 at 09:00, Emmerdale wrote:\n> A job in your area needs pricing`;
    const out = stripReply(mail);
    expect(out).toContain('450 + vat');
    expect(out).not.toContain('needs pricing');
  });

  it('cuts at "Sent from my" and From: blocks', () => {
    expect(stripReply('£500 all in\nSent from my iPhone')).toBe('£500 all in');
    expect(stripReply('ok 450\nFrom: someone@x.com\nblah')).toBe('ok 450');
  });

  it('caps length', () => {
    expect(stripReply('x'.repeat(5000)).length).toBeLessThanOrEqual(2000);
  });
});

describe('ReplyParseSchema fixtures', () => {
  it('accepts well-formed tool output', () => {
    expect(
      ReplyParseSchema.safeParse({
        intent: 'quote',
        amount_pence: 45000,
        is_range: false,
        range_high_pence: null,
        mentions_vat: true,
        needs_site_visit: false,
        confidence: 0.9,
      }).success,
    ).toBe(true);
  });

  it('rejects malformed output', () => {
    expect(ReplyParseSchema.safeParse({ intent: 'maybe' }).success).toBe(false);
    expect(
      ReplyParseSchema.safeParse({
        intent: 'quote',
        amount_pence: -5,
        is_range: false,
        range_high_pence: null,
        mentions_vat: false,
        needs_site_visit: false,
        confidence: 0.5,
      }).success,
    ).toBe(false);
  });
});
