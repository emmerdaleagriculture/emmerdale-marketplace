/**
 * The customer proposition, in one place.
 *
 * The home page hero and the mobile app's entry screen (/app) both render
 * from these constants. /app used to carry its own copied wording, and it
 * drifted: the home page moved to "several prices, compared side by side,
 * insured by us" while the app still said "we'll pass it to contractors",
 * which reads like lead generation — the thing the site says it is not.
 * Change the wording here and both surfaces follow.
 *
 * Claims that were deliberately retired from the site stay retired:
 * "Prices upfront" (there is no price until operators quote) and "we hold
 * your money" (we hold a 15% deposit, not the full price).
 */

export const KICKER = 'A managed marketplace for rural land';

export const HEADLINE = 'Get prices from agricultural contractors near you.';

/** Hero standfirst, split around the emphasised phrase. */
export const STANDFIRST = {
  before: 'Tell us what needs doing. Vetted operators covering your patch price the job, ',
  emphasis: 'you see them side by side',
  after: ', and you book the one you want — with the work insured by us. No phone calls out of the blue.',
} as const;

/** The hero's three promises, each the answer to a real hesitation. */
export const PROMISES: readonly (readonly [string, string])[] = [
  [
    'Several prices, not one.',
    'Approved operators near you price your job, usually inside 24 hours, and you can message any of them before you accept.',
  ],
  ['Vetted operators, and every job insured.', 'Our own £5m policy covers the work, whoever does it.'],
  ['We hold your deposit until you’re happy.', 'The contractor gets paid when you say the job’s right.'],
];

/** The trust ticker under the header. */
export const TICKER: readonly string[] = ['Several prices to choose from', 'Vetted & insured operators'];

export const START_NOTE = 'Takes about a minute. No account needed.';
export const NO_OBLIGATION = 'Free and no obligation — you’re not booking anything yet.';

export const OPERATOR_QUESTION = 'Run an agricultural contracting business?';
export const OPERATOR_CTA = 'Apply to join';
