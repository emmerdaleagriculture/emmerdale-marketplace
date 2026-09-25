import { describe, expect, it } from 'vitest';
import { messageProblem } from './messageText';

describe('messageProblem', () => {
  it('passes an ordinary question either way, before and after award', () => {
    for (const state of ['pre_award', 'post_award'] as const) {
      expect(messageProblem('Is the gate wide enough for a tractor?', 'contractor', state)).toBeNull();
      expect(messageProblem('About 3m, and the ground is dry', 'client', state)).toBeNull();
    }
  });

  it('refuses an empty message', () => {
    expect(messageProblem('   ', 'client', 'pre_award')).toMatch(/write a message/i);
  });

  it('refuses contact details before award, from either side', () => {
    for (const sender of ['client', 'contractor'] as const) {
      expect(messageProblem('Ring me on 07123 456 789', sender, 'pre_award')).toMatch(/phone/);
      expect(messageProblem('email me at a@b.com', sender, 'pre_award')).toMatch(/email/);
      expect(messageProblem('see www.example.com', sender, 'pre_award')).toMatch(/link/);
    }
  });

  it('allows contact details after award', () => {
    expect(messageProblem('My number is 07123 456789', 'contractor', 'post_award')).toBeNull();
    expect(messageProblem('Call me on 07123 456789', 'client', 'post_award')).toBeNull();
  });

  it('never lets a contractor name a figure', () => {
    expect(messageProblem('I can do it for £400', 'contractor', 'pre_award')).toMatch(/amounts/);
    expect(messageProblem('Extra £50 for the bank', 'contractor', 'post_award')).toMatch(/amounts/);
  });

  it('lets the customer mention money', () => {
    expect(messageProblem('My budget is £300', 'client', 'pre_award')).toBeNull();
  });

  it('refuses an over-long message', () => {
    expect(messageProblem('a'.repeat(2001), 'client', 'post_award')).toMatch(/too long/);
  });
});
