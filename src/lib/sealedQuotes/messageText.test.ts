import { describe, expect, it } from 'vitest';
import { messageProblem, messageRefusal } from './messageText';

describe('messageProblem', () => {
  it('passes an ordinary question either way, before and after award', () => {
    for (const state of ['pre_award', 'post_award'] as const) {
      expect(messageProblem('Is the gate wide enough for a tractor?', 'contractor', state)).toBeNull();
      expect(messageProblem('About 3m, and the ground is dry', 'client', state)).toBeNull();
    }
  });

  it('refuses an empty message', () => {
    expect(messageProblem('   ', 'client', 'pre_award')).toMatch(/write a message/i);
    expect(messageProblem('   ', 'client', 'pre_award', true)).toBeNull();
  });

  it('refuses contact details before award, from either side', () => {
    for (const sender of ['client', 'contractor'] as const) {
      expect(messageProblem('Ring me on 07123 456 789', sender, 'pre_award')).toMatch(/phone/);
      expect(messageProblem('email me at a@b.com', sender, 'pre_award')).toMatch(/email/);
      expect(messageProblem('see www.example.com', sender, 'pre_award')).toMatch(/link/);
    }
  });

  it('refuses an email address sent in pieces (7 Oct 2026)', () => {
    const pieces = ['Fielding.natalie@ it won’t let me send it so I’ll try in 2 messages', 'Yahoo', '. co . uk'];
    expect(messageRefusal(pieces[0], 'client', 'pre_award')?.flag).toBe('email_or_link');
    expect(messageRefusal(pieces[1], 'client', 'pre_award', false, [pieces[0]])?.flag).toBe('email_or_link');
    expect(messageRefusal(pieces[2], 'client', 'pre_award', false, pieces.slice(0, 2))?.flag).toBe('email_or_link');
    // Each piece that names nothing on its own is still caught joined up.
    expect(messageRefusal('com', 'client', 'pre_award', false, ['natalie', '@', 'yahoo.'])?.flag).toBe('email_or_link');
    for (const body of [
      'natalie at yahoo dot co dot uk',
      'jim (at) farm . com',
      'its my gmail',
      'Could you send me your email address please?',
      'email me and I’ll reply',
    ]) {
      expect(messageRefusal(body, 'contractor', 'pre_award')?.flag, body).toBe('email_or_link');
    }
  });

  it('refuses a mobile split across messages', () => {
    expect(messageRefusal('170203', 'contractor', 'pre_award', false, ['ok', 'it’s 07824'])?.flag).toBe('phone');
  });

  it('leaves ordinary words and times alone, alone or joined', () => {
    for (const body of ['Can start @ 9am Monday', 'The outlook is wet this week', 'Live in the area', 'Sky’s clear, ground is firm']) {
      expect(messageRefusal(body, 'contractor', 'pre_award', false, ['Gate is 12ft', 'About 3 acres'])).toBeNull();
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

  it('refuses paying some other way, from either side, before and after award', () => {
    for (const state of ['pre_award', 'post_award'] as const) {
      expect(messageProblem('Cash for the balance is fine', 'contractor', state)).toMatch(/payment arrangements/);
      expect(messageProblem('Can I pay you cash instead?', 'client', state)).toMatch(/payment arrangements/);
      expect(messageProblem('I’ll knock the VAT off if you pay me directly', 'contractor', state)).toMatch(/payment arrangements/);
    }
  });

  it('keeps a full postcode out before award, not the district', () => {
    expect(messageProblem('2 Riverside Lodge, Durham DH1 3SS', 'client', 'pre_award')).toMatch(/postcode/);
    expect(messageProblem('we are at dh13ss', 'client', 'pre_award')).toMatch(/postcode/);
    expect(messageProblem('I am in DH1, near the river', 'client', 'pre_award')).toBeNull();
    expect(messageProblem('Cut to 3 inches, 2 passes', 'client', 'pre_award')).toBeNull();
    expect(messageProblem('Our address is DH1 3SS', 'client', 'post_award')).toBeNull();
  });
});

describe('messageRefusal flags', () => {
  it('names the rule that counts against a standing', () => {
    expect(messageRefusal('Ring me on 07123 456 789', 'contractor', 'pre_award')?.flag).toBe('phone');
    expect(messageRefusal('email me at a@b.com', 'client', 'pre_award')?.flag).toBe('email_or_link');
    expect(messageRefusal('we are at DH1 3SS', 'client', 'pre_award')?.flag).toBe('postcode');
    expect(messageRefusal('cash is fine', 'contractor', 'post_award')?.flag).toBe('off_platform');
  });

  it('does not flag shape or tidiness refusals', () => {
    expect(messageRefusal('   ', 'client', 'pre_award')?.flag).toBeNull();
    expect(messageRefusal('I can do it for £400', 'contractor', 'pre_award')?.flag).toBeNull();
    expect(messageRefusal('Is the gate wide?', 'contractor', 'pre_award')).toBeNull();
  });
});

describe('the 5 Oct 2026 messages (West Sussex land services)', () => {
  it('refuses a mobile split across words', () => {
    expect(
      messageProblem('My tractor is a Massey 07824 my topper is 170203', 'contractor', 'pre_award'),
    ).toMatch(/phone/);
  });

  it('refuses moving the conversation to another app or a call', () => {
    for (const t of [
      'Do u want to message me on WhatsApp',
      'whats app me',
      'Give me a ring',
      'text me and we can sort it',
      'find me on facebook',
    ]) {
      expect(messageProblem(t, 'contractor', 'pre_award'), t).toMatch(/conversation here/);
    }
  });

  it('refuses a bare figure as a price from a contractor', () => {
    expect(messageProblem('3 hours would be 150', 'contractor', 'pre_award')).toMatch(/amounts/);
    expect(messageProblem("it's about 300 all in", 'contractor', 'pre_award')).toMatch(/amounts/);
  });

  it('still lets ordinary job talk through', () => {
    for (const t of [
      'Hi, we couldn’t do the job in 3 hours because there is almost 4 hours of transport as you are 51 miles away',
      'It would be 2 hours on site',
      "That's 10 acres of topping, the gate is 12 foot",
      'My tractor is 120 hp, the topper is 6 ft wide',
      'Could do 07/10 or 14/10, start 8am, it’s 20 minutes from the yard',
      'Happy to call in and look at the field next week',
    ]) {
      expect(messageProblem(t, 'contractor', 'pre_award'), t).toBeNull();
    }
  });
});
