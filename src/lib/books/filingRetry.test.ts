import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
vi.mock('./receipts.server', () => ({ RECEIPTS_BUCKET: 'x' }));
vi.mock('./server', () => ({ trialBalance: async () => [] }));

describe('stalled', () => {
  it('stops retrying a sending filing after 23 hours, never a finished one', async () => {
    const { stalled } = await import('./filing.server');
    const now = Date.parse('2027-08-02T12:00:00Z');
    expect(stalled({ status: 'sending', created_at: '2027-08-02T00:00:00Z' }, now)).toBe(false);
    expect(stalled({ status: 'sending', created_at: '2027-08-01T12:00:00Z' }, now)).toBe(true);
    expect(stalled({ status: 'accepted', created_at: '2027-07-01T12:00:00Z' }, now)).toBe(false);
  });
});
