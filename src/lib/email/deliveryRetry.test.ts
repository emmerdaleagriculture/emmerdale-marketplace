import { describe, expect, it } from 'vitest';
import {
  MAX_DELIVERY_RETRIES,
  describeDelay,
  isHardBounce,
  isWorthRetrying,
  retryDelayMs,
} from './deliveryRetry';

describe('isHardBounce', () => {
  it('treats a Permanent bounce as final', () => {
    expect(isHardBounce({ type: 'Permanent', subType: 'General' })).toBe(true);
  });

  it('does not treat a full mailbox as final', () => {
    // The exact shape Resend sent for toby_connelly1999@hotmail.co.uk, twice.
    expect(isHardBounce({ type: 'Transient', subType: 'MailboxFull' })).toBe(false);
  });

  it('reads a nonexistent mailbox as final however it is labelled', () => {
    expect(isHardBounce({ subType: 'NoEmail_Nonexistent' })).toBe(true);
  });

  it('does not write an address off on a bounce nobody classified', () => {
    // Lenient on purpose, and the same call record_undeliverable_email makes:
    // an unclassified bounce is retried rather than treated as a dead address.
    expect(isHardBounce(undefined)).toBe(false);
    expect(isHardBounce({ type: 'Unknown' })).toBe(false);
    expect(isWorthRetrying('bounced', { type: 'Unknown' })).toBe(true);
  });
});

describe('isWorthRetrying', () => {
  it('retries a provider-side failure', () => {
    // The 15 Sep 2026 minute: six accepted messages, all reported failed.
    expect(isWorthRetrying('failed', undefined)).toBe(true);
  });

  it('retries a transient bounce', () => {
    expect(isWorthRetrying('bounced', { type: 'Transient', subType: 'MailboxFull' })).toBe(true);
  });

  it('never retries a wrong address', () => {
    expect(isWorthRetrying('bounced', { type: 'Permanent', subType: 'General' })).toBe(false);
    expect(isWorthRetrying('suppressed', undefined)).toBe(false);
  });

  it('never retries a complaint — that is someone asking us to stop', () => {
    expect(isWorthRetrying('complained', undefined)).toBe(false);
  });

  it('leaves a delayed message to Resend, which is still trying', () => {
    expect(isWorthRetrying('delayed', undefined)).toBe(false);
  });

  it('does not retry a success', () => {
    expect(isWorthRetrying('delivered', undefined)).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('waits minutes first, then hours', () => {
    expect(retryDelayMs(0)).toBe(15 * 60 * 1000);
    expect(retryDelayMs(1)).toBe(4 * 60 * 60 * 1000);
  });

  it('never returns a delay shorter than the queue drain interval', () => {
    // The queue drains every minute. A retry due sooner than that goes out
    // into the same conditions that just rejected it.
    for (let i = 0; i < MAX_DELIVERY_RETRIES; i++) {
      expect(retryDelayMs(i)).toBeGreaterThan(60 * 1000);
    }
  });

  it('stops after the bound, so a refusing address is not hammered', () => {
    expect(retryDelayMs(MAX_DELIVERY_RETRIES)).toBeNull();
    expect(retryDelayMs(99)).toBeNull();
  });
});

describe('describeDelay', () => {
  it('reads as English in an admin alert', () => {
    expect(describeDelay(15 * 60 * 1000)).toBe('in 15 minutes');
    expect(describeDelay(4 * 60 * 60 * 1000)).toBe('in 4 hours');
  });
});
