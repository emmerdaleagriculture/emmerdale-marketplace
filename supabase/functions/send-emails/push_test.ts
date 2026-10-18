import { assertEquals } from 'jsr:@std/assert@1';
import { isUrgent, renderPush } from './push.ts';

const site = 'https://www.emmerdaleagriculture.com';

Deno.test('an invitation push says where and by when, and taps to the price page', () => {
  const r = renderPush('sq_invitation', { token: 'abc', service: 'Paddock topping', postcode_district: 'SO41', distance_miles: 6, area_value: 4, area_unit: 'acres' }, site)!;
  assertEquals(r.title, 'New job 6 miles away');
  assertEquals(r.body, 'Paddock topping · 4 acres near SO41.');
  assertEquals(r.url, `${site}/quote/abc`);
});

Deno.test('a message push is the sender and the first 80 characters', () => {
  const r = renderPush('sq_message_to_client', { from: 'Hartwell Agri', body: 'x'.repeat(100), client_token: 't1' }, site)!;
  assertEquals(r.title, 'Hartwell Agri');
  assertEquals(r.body.length, 80);
  assertEquals(r.url, `${site}/my/t1#messages`);
});

Deno.test('nothing to link to means no push', () => {
  assertEquals(renderPush('sq_invitation', { service: 'x' }, site), null);
  assertEquals(renderPush('sq_weekly_digest', {}, site), null);
});

Deno.test('messages, wins and clocked invitations are urgent; the rest wait for daytime', () => {
  assertEquals(isUrgent('sq_message_to_contractor', {}), true);
  assertEquals(isUrgent('sq_award_won', {}), true);
  assertEquals(isUrgent('sq_invitation', { premium: true }), true);
  assertEquals(isUrgent('sq_invitation', {}), false);
  assertEquals(isUrgent('sq_quotes_nudge_1', {}), false);
});
