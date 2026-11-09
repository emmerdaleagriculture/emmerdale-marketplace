import { assertEquals } from 'jsr:@std/assert@1';
import { redundantTexts } from './sms.ts';

/** Just enough of the client: from(table).select().in()….not() resolves to the table's rows. */
function fake(rows: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const result = { data: rows[table] ?? [] };
      const q: any = { select: () => q, in: () => q, not: () => q, then: (r: any) => Promise.resolve(result).then(r) };
      return q;
    },
  };
}

const invite = (id: string, contractor: string) => ({
  id, email_id: `e-${id}`, kind: 'sq_invitation', contractor_id: contractor, payload: { submission_id: 's1' },
});

Deno.test('a tapped push or an opened invitation makes the text redundant; nothing else does', async () => {
  const out = await redundantTexts(fake({
    pending_push: [{ email_id: 'e-a', clicked_at: '2026-11-04T10:00:00Z' }, { email_id: 'e-b', clicked_at: null },
                   { email_id: 'e-c', clicked_at: null }, { email_id: 'e-d', clicked_at: null }],
    job_invitations: [{ contractor_id: 'cb', submission_id: 's1' }],
  }), [
    invite('a', 'ca'),
    invite('b', 'cb'),
    invite('c', 'cc'),
    { ...invite('d', 'cb'), kind: 'sq_message_to_contractor' },
  ]);
  assertEquals(Object.fromEntries(out), { a: 'push opened', b: 'job already opened' });
});

Deno.test('no held texts, no queries', async () => {
  assertEquals((await redundantTexts(null, [])).size, 0);
});

Deno.test('the app line goes on only when it adds no segment', async () => {
  const { withSmsAppLine } = await import('./sms.ts');
  const site = 'https://www.emmerdaleagriculture.com';
  const short = 'Emmerdale Agriculture: new job to price - Topping, SO51. https://www.emmerdaleagriculture.com/t/AbCdEfG';
  assertEquals(withSmsAppLine(short, site), short + ' Our app: www.emmerdaleagriculture.com/apps');
  const full = 'x'.repeat(150);
  assertEquals(withSmsAppLine(full, site), full);
});

Deno.test('a due phone gets the line even when it costs a segment', async () => {
  const { withSmsAppLine } = await import('./sms.ts');
  const full = 'x'.repeat(150);
  assertEquals(withSmsAppLine(full, 'https://www.emmerdaleagriculture.com', true).length, 193);
});
