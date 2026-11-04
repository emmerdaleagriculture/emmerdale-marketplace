import { assertEquals } from 'jsr:@std/assert@1';
import { pushMadeTextRedundant } from './sms.ts';

/** Just enough of the client: from(table).select().eq()….maybeSingle(). */
function fake(rows: Record<string, Record<string, unknown> | null>) {
  return {
    from(table: string) {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: rows[table] ?? null }) };
      return q;
    },
  };
}

const invitation = {
  email_id: 'e1', kind: 'sq_invitation', contractor_id: 'c1', payload: { submission_id: 's1' },
};

Deno.test('a tapped push makes the text redundant', async () => {
  assertEquals(await pushMadeTextRedundant(fake({ pending_push: { clicked_at: '2026-11-04T10:00:00Z' } }), invitation), 'push opened');
});

Deno.test('an invitation opened by any route makes the text redundant', async () => {
  assertEquals(await pushMadeTextRedundant(fake({
    pending_push: { clicked_at: null }, job_invitations: { opened_at: '2026-11-04T10:00:00Z' },
  }), invitation), 'job already opened');
});

Deno.test('an untapped push leaves the text to go', async () => {
  assertEquals(await pushMadeTextRedundant(fake({
    pending_push: { clicked_at: null }, job_invitations: { opened_at: null },
  }), invitation), null);
});

Deno.test('a message text only looks at the push', async () => {
  assertEquals(await pushMadeTextRedundant(fake({
    pending_push: { clicked_at: null }, job_invitations: { opened_at: '2026-11-04T10:00:00Z' },
  }), { ...invitation, kind: 'sq_message_to_contractor' }), null);
});
