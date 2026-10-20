/**
 * The directory's shared words and thresholds, in one place: the cover
 * disclaimer is a statement about what our protection applies to, so the
 * county sections and the directory page must say it identically.
 */
export const DIRECT_DISCLAIMER =
  'Work agreed directly with a contractor is between you and them: our deposit, cover and payment protection apply only to jobs priced through us.';

/**
 * A member listed in this many counties or more covers the country (a
 * supplier set to every county, as hay merchants are): the card says so
 * instead of naming ninety counties, and their counties do not become chips.
 */
export const NATIONWIDE_AT = 40;
export const isNationwide = (counties: string[]) => counties.length >= NATIONWIDE_AT;
