import { describe, expect, it } from 'vitest';
import { paymentReference } from './site';

describe('paymentReference', () => {
  it('is EA- plus the first eight hex characters, upper-cased', () => {
    expect(paymentReference('d0087ec3-3a7c-4f6b-9d2f-704ff2303d4b')).toBe('EA-D0087EC3');
  });
  it('skips hyphens so an id is never cut short', () => {
    expect(paymentReference('4772b185-14b3-4840-9c82-edfc23121be6')).toBe('EA-4772B185');
  });
});
