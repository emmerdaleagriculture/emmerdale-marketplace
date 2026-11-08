import { afterEach, describe, expect, it } from 'vitest';
import { cronAuthorised } from '@/lib/cronAuth';

const req = (h: Record<string, string>) => new Request('https://x.test/api/cron/x', { headers: h });

describe('cronAuthorised', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('accepts the Vercel bearer and the scheduler header', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(cronAuthorised(req({ authorization: 'Bearer s3cret' }))).toBe(true);
    expect(cronAuthorised(req({ 'x-cron-secret': 's3cret' }))).toBe(true);
  });

  it('refuses wrong, partial and missing secrets', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(cronAuthorised(req({ authorization: 'Bearer s3cre' }))).toBe(false);
    expect(cronAuthorised(req({ 'x-cron-secret': 's3cretX' }))).toBe(false);
    expect(cronAuthorised(req({ authorization: 's3cret' }))).toBe(false);
    expect(cronAuthorised(req({}))).toBe(false);
  });

  it('refuses everything when CRON_SECRET is unset', () => {
    expect(cronAuthorised(req({ authorization: 'Bearer ' }))).toBe(false);
    expect(cronAuthorised(req({ 'x-cron-secret': '' }))).toBe(false);
  });
});
