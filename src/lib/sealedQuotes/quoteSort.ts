/**
 * Client-facing price ordering — spec §18a option C (decided): a composite
 * "Recommended" default with a visible client-controlled toggle for lowest
 * price / highest rated. The weighting is a stored config value
 * (app_config.sq_composite_weight), passed in — never hardcoded.
 *
 * Cold start (§18a): a contractor with fewer than 3 ratings shows a neutral
 * "New" badge and is excluded from the composite score — they fall to
 * price-order placement, neither penalised nor inflated.
 */

export type SortableQuote = {
  id: string;
  client_price_pence: number;
  contractor_rating_avg: number | null;
  contractor_rating_count: number;
};

export type SortMode = 'recommended' | 'price' | 'rating';

export const RATED_THRESHOLD = 3;

export function isNewContractor(q: SortableQuote): boolean {
  return q.contractor_rating_count < RATED_THRESHOLD || q.contractor_rating_avg === null;
}

/**
 * Composite score: lower is better. Price is normalised against the cheapest
 * live quote; the rating term is CENTRED on 3 stars so it can pull either
 * way (5★ = −ratingWeight, 1★ = +ratingWeight). A "New" contractor scores on
 * price alone, which sits exactly at the neutral point — genuinely neither
 * penalised nor inflated (§18a cold start).
 */
function compositeScore(q: SortableQuote, minPrice: number, ratingWeight: number): number {
  const priceScore = q.client_price_pence / minPrice; // 1.0 = cheapest
  const rating = q.contractor_rating_avg ?? 3;
  return priceScore - ((rating - 3) / 2) * ratingWeight;
}

export function sortClientQuotes<T extends SortableQuote>(
  quotes: T[],
  mode: SortMode,
  config: { ratingWeight: number },
): T[] {
  const byPrice = (a: T, b: T) =>
    a.client_price_pence - b.client_price_pence || a.id.localeCompare(b.id);

  if (mode === 'price') return [...quotes].sort(byPrice);

  if (mode === 'rating') {
    return [...quotes].sort((a, b) => {
      const ra = a.contractor_rating_avg ?? -1;
      const rb = b.contractor_rating_avg ?? -1;
      return rb - ra || byPrice(a, b);
    });
  }

  // Recommended: rated contractors by composite, then new contractors by
  // price — interleaved by treating new contractors as composite = price
  // score alone (no rating boost, no penalty).
  const minPrice = Math.min(...quotes.map((q) => q.client_price_pence));
  return [...quotes].sort((a, b) => {
    const sa = isNewContractor(a)
      ? a.client_price_pence / minPrice
      : compositeScore(a, minPrice, config.ratingWeight);
    const sb = isNewContractor(b)
      ? b.client_price_pence / minPrice
      : compositeScore(b, minPrice, config.ratingWeight);
    return sa - sb || byPrice(a, b);
  });
}
