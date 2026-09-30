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
    // Found by review: the word boundary meant no-space forms slipped past.
    blocked('GBP450 all in');
    blocked('450GBP for the lot');
    blocked('$450 if you want it done this week');
    blocked('€450');
  });

  it('blocks a unit rate, which is the price by another name', () => {
    blocked('400 per acre');
    blocked('40/acre');
    blocked('£40 an hour');
    blocked('90 per hour plus travel');
    blocked('12 per bale');
  });

  it('still allows measurements that look like rates', () => {
    ok('Machine cuts 2 acres an hour, so it is a morning.');
    ok('Gateway needs 3 metres.');
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
    ok('Free 01/10/2026 to 05/10/2026.');
    ok('Did 12 acres in 3 hours, 2 passes.');
  });

  it('finds a number broken over lines, whatever follows it', () => {
    // The message that got through on 29 Sep 2026.
    blocked('077 66\n400\n300\n\n2 riverside lodge\nBurn hall');
    blocked('07766 400300 then 2 more');
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

  it('blocks arranging payment outside the platform', () => {
    // The three notes found live on 29 Sept.
    const cash = /payment arrangements/;
    expect(clientNoteProblem('If it is cash on the day I will take the VAT off , I am available either to come any evening or one day at the weekend')).toMatch(cash);
    expect(clientNoteProblem('If it is cash VAT will be taken off I can come one evening or at the weekend')).toMatch(cash);
    expect(clientNoteProblem('Cash price \r\nminimum charge for a hours of tractor to work  as it will take less than an hour to do')).toMatch(cash);
    // And the other ways of saying it.
    expect(clientNoteProblem('Happy to take a bank transfer')).toMatch(cash);
    expect(clientNoteProblem('Cheque is fine')).toMatch(cash);
    expect(clientNoteProblem('Pay me direct and I can knock the VAT off')).toMatch(cash);
    expect(clientNoteProblem('Cheaper if paid directly')).toMatch(cash);
    expect(clientNoteProblem('Can do it off the books')).toMatch(cash);
    expect(clientNoteProblem('Better if we sort it outside the site')).toMatch(cash);
    // Reported as the cash, not the figure: the cash is what admin is told about.
    expect(clientNoteProblem('400 quid cash')).toMatch(cash);
  });

  it('lets a VAT status through', () => {
    ok('I am not VAT registered so there is no VAT on this.');
    ok('Price is without VAT.');
  });
});
