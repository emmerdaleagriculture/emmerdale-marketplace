/**
 * Why a customer passed on a price (20261002170000_price_passes). On its
 * own so the price list, a client component, can import it without
 * dragging the server-side client in behind it.
 */
export const PASS_REASONS: [string, string][] = [
  ['too_expensive', 'More than I want to pay'],
  ['too_far', 'Too far away'],
  ['visit_first', 'I’d want them to see the site first'],
  ['terms', 'Something in the price or note doesn’t suit'],
  ['other', 'Something else'],
];
