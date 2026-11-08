import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({}));

const { signOAuthState, verifyOAuthState } = await import('@/lib/gsc');

describe('GSC OAuth state', () => {
  beforeAll(() => {
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';
  });

  it('accepts a state it signed', () => {
    expect(verifyOAuthState(signOAuthState())).toBe(true);
  });

  it('refuses an unsigned random state (the old format)', () => {
    expect(verifyOAuthState('a'.repeat(48))).toBe(false);
  });

  it('refuses a tampered state', () => {
    const s = signOAuthState();
    expect(verifyOAuthState(s.slice(0, -1) + (s.endsWith('0') ? '1' : '0'))).toBe(false);
  });

  it('tolerates a little clock skew between instances, not a lot', () => {
    const t = Date.now();
    expect(verifyOAuthState(signOAuthState(t + 5_000), t)).toBe(true);
    expect(verifyOAuthState(signOAuthState(t + 5 * 60 * 1000), t)).toBe(false);
  });

  it('refuses a state older than ten minutes', () => {
    const t = Date.now();
    expect(verifyOAuthState(signOAuthState(t - 11 * 60 * 1000), t)).toBe(false);
  });

  it('refuses everything when the secret is unset', () => {
    const s = signOAuthState();
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    expect(verifyOAuthState(s)).toBe(false);
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';
  });
});
