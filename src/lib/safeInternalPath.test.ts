import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({}));
vi.mock('next/headers', () => ({}));

const { safeInternalPath } = await import('@/lib/auth');

describe('safeInternalPath', () => {
  it.each(['/my', '/admin', '/my/abc?x=1#y', '/login?next=%2Fadmin'])('keeps %s', (p) => {
    expect(safeInternalPath(p)).toBe(p);
  });

  it.each([
    null,
    '',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r\n/evil.com',
    '/\x00x',
    'evil.com',
  ])('refuses %j', (p) => {
    expect(safeInternalPath(p)).toBeNull();
  });
});
