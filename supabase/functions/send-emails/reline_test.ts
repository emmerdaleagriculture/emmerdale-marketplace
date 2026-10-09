import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { jobReference, withReference } from './reline.ts';

Deno.test('uses the stamped title first', () => {
  assertEquals(jobReference({ job_title: 'Paddock topping, 4 acres, SO23', service: 'x' }), 'Paddock topping, 4 acres, SO23');
});

Deno.test('falls back to service and district for rows queued before the stamp', () => {
  assertEquals(jobReference({ service: 'Hedge cutting', postcode_district: 'EX16' }), 'Hedge cutting, EX16');
  assertEquals(jobReference({ service: 'Hedge cutting' }), 'Hedge cutting');
  assertEquals(jobReference({ postcode_district: 'EX16' }), 'EX16');
});

Deno.test('nothing for an email that is not about a job', () => {
  assertEquals(jobReference({ business_name: 'X', jobs: [] }), null);
  assertEquals(jobReference({ job_title: '   ' }), null);
  assertEquals(withReference('Hello', {}), 'Hello');
});

Deno.test('the line sits above the body with a blank line between', () => {
  assertEquals(withReference('Hi there,\n\nBody.', { job_title: 'Fencing, 120 metres, SO23' }), 'Re: Fencing, 120 metres, SO23\n\nHi there,\n\nBody.');
});
