import { describe, expect, it } from 'vitest';
import { lockedMinutes, maskEmail, resendWaitSeconds } from './phoneRules';

const base = { phone: null, last_sent_at: null, failures: 0, locked_until: null, verified_at: null, match_user_id: null };

describe('resendWaitSeconds', () => {
  it('counts down from 30 seconds after the last send', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    expect(resendWaitSeconds({ ...base, last_sent_at: '2026-10-18T11:59:50Z' }, now)).toBe(20);
    expect(resendWaitSeconds({ ...base, last_sent_at: '2026-10-18T11:59:00Z' }, now)).toBe(0);
    expect(resendWaitSeconds(null, now)).toBe(0);
  });
});

describe('lockedMinutes', () => {
  it('rounds up what is left of a lockout', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    expect(lockedMinutes({ ...base, locked_until: '2026-10-18T12:09:30Z' }, now)).toBe(10);
    expect(lockedMinutes({ ...base, locked_until: '2026-10-18T11:59:00Z' }, now)).toBe(0);
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('tom@example.com')).toBe('t•••@example.com');
    expect(maskEmail('nonsense')).toBe('•••');
  });
});
