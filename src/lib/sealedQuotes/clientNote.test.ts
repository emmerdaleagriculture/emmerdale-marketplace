import { describe, expect, it } from 'vitest';
import { CLIENT_NOTE_MAX, clientNoteProblem } from './clientNote';

/**
 * These guardrails are the whole review process. A contractor's note reaches
 * the customer in the same transaction that stores it, so anything that gets
 * past here gets read.
 */

const ok = (s: string) => expect(clientNoteProblem(s)).toBeNull();
const blocked = (s: string) => expect(clientNoteProblem(s)).toBeTypeOf('string');

describe('clientNoteProblem — what a customer may be shown', () => {
  it('lets ordinary trade notes through', () => {
    ok('Can do it Tuesday if the gateway is clear.');
    ok('Price covers cutting and collecting. Arisings left in the corner.');
    ok('I would want to see the access before I start — the lane looks tight.');
    ok('Happy to do the two acres in one visit, weather allowing.');
    ok('');
    ok('   ');
  });

  it('blocks the contractor quoting their own figure', () => {
    // The customer sees contractor price + sq_markup_rate. A figure in the
    // note hands them the margin.
    blocked('£400 all in.');
    blocked('That is £ 400 for the lot');
    blocked('400 quid, cash or bank transfer');
    blocked('Four hundred pounds including the gateway');
    blocked('GBP 450 for the acreage stated');
  });

  it('leaves bare numbers alone — they are usually not money', () => {
    ok('2 acres at most, I reckon half a day.');
    ok('Can start within 24 hours of you accepting.');
    ok('Need 3 metres of clearance through the gate.');
    ok('Machine is 2.5m wide.');
  });

  it('blocks ways to reach the contractor directly', () => {
    blocked('Give me a ring on 07123 456789');
    blocked('call 07123456789');
    blocked('ring me: +44 7123 456789');
    blocked('01962 123456 is the yard');
    blocked('email dave@davescontracting.co.uk');
    blocked('see https://example.com for photos of previous work');
    blocked('we are at www.davescontracting.co.uk');
    blocked('look us up at davescontracting.co.uk');
  });

  it('does not mistake dates or measurements for phone numbers', () => {
    ok('Free from 12 October.');
    ok('Done 40 paddocks like this one.');
    ok('Cutting height 75mm.');
  });

  it('caps the length', () => {
    ok('a'.repeat(CLIENT_NOTE_MAX));
    blocked('a'.repeat(CLIENT_NOTE_MAX + 1));
  });

  it('explains what to do rather than scolding', () => {
    // The contractor has to be able to act on the message without support.
    for (const bad of ['£400 all in', 'ring 07123456789', 'www.example.com']) {
      const msg = clientNoteProblem(bad);
      expect(msg).toMatch(/please|keep it/i);
    }
  });
});
