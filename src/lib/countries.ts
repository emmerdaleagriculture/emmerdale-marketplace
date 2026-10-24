/**
 * Countries, for the phase-0 interest form and the admin country view. Not
 * the whole ISO list: the ones a land-work marketplace in English is likely
 * to hear from, plus "somewhere else" with a free-text place. The alpha-3
 * code is what Search Console returns ("gbr"); the alpha-2 is what Vercel
 * puts on requests ("GB") and what we store.
 */
export type Country = { code: string; alpha3: string; name: string };

export const COUNTRIES: Country[] = [
  { code: 'GB', alpha3: 'GBR', name: 'United Kingdom' },
  { code: 'IE', alpha3: 'IRL', name: 'Ireland' },
  { code: 'AU', alpha3: 'AUS', name: 'Australia' },
  { code: 'NZ', alpha3: 'NZL', name: 'New Zealand' },
  { code: 'US', alpha3: 'USA', name: 'United States' },
  { code: 'CA', alpha3: 'CAN', name: 'Canada' },
  { code: 'ZA', alpha3: 'ZAF', name: 'South Africa' },
  { code: 'FR', alpha3: 'FRA', name: 'France' },
  { code: 'DE', alpha3: 'DEU', name: 'Germany' },
  { code: 'NL', alpha3: 'NLD', name: 'Netherlands' },
  { code: 'BE', alpha3: 'BEL', name: 'Belgium' },
  { code: 'ES', alpha3: 'ESP', name: 'Spain' },
  { code: 'PT', alpha3: 'PRT', name: 'Portugal' },
  { code: 'IT', alpha3: 'ITA', name: 'Italy' },
  { code: 'DK', alpha3: 'DNK', name: 'Denmark' },
  { code: 'SE', alpha3: 'SWE', name: 'Sweden' },
  { code: 'NO', alpha3: 'NOR', name: 'Norway' },
  { code: 'FI', alpha3: 'FIN', name: 'Finland' },
  { code: 'AT', alpha3: 'AUT', name: 'Austria' },
  { code: 'CH', alpha3: 'CHE', name: 'Switzerland' },
  { code: 'PL', alpha3: 'POL', name: 'Poland' },
  { code: 'CZ', alpha3: 'CZE', name: 'Czechia' },
  { code: 'HU', alpha3: 'HUN', name: 'Hungary' },
  { code: 'RO', alpha3: 'ROU', name: 'Romania' },
  { code: 'GR', alpha3: 'GRC', name: 'Greece' },
  { code: 'AL', alpha3: 'ALB', name: 'Albania' },
  { code: 'IS', alpha3: 'ISL', name: 'Iceland' },
  { code: 'JE', alpha3: 'JEY', name: 'Jersey' },
  { code: 'GG', alpha3: 'GGY', name: 'Guernsey' },
  { code: 'IM', alpha3: 'IMN', name: 'Isle of Man' },
  { code: 'IN', alpha3: 'IND', name: 'India' },
  { code: 'PK', alpha3: 'PAK', name: 'Pakistan' },
  { code: 'AE', alpha3: 'ARE', name: 'United Arab Emirates' },
  { code: 'SA', alpha3: 'SAU', name: 'Saudi Arabia' },
  { code: 'IL', alpha3: 'ISR', name: 'Israel' },
  { code: 'TR', alpha3: 'TUR', name: 'Türkiye' },
  { code: 'KE', alpha3: 'KEN', name: 'Kenya' },
  { code: 'NG', alpha3: 'NGA', name: 'Nigeria' },
  { code: 'GH', alpha3: 'GHA', name: 'Ghana' },
  { code: 'ZW', alpha3: 'ZWE', name: 'Zimbabwe' },
  { code: 'ZM', alpha3: 'ZMB', name: 'Zambia' },
  { code: 'AO', alpha3: 'AGO', name: 'Angola' },
  { code: 'NA', alpha3: 'NAM', name: 'Namibia' },
  { code: 'BW', alpha3: 'BWA', name: 'Botswana' },
  { code: 'AR', alpha3: 'ARG', name: 'Argentina' },
  { code: 'BR', alpha3: 'BRA', name: 'Brazil' },
  { code: 'CL', alpha3: 'CHL', name: 'Chile' },
  { code: 'UY', alpha3: 'URY', name: 'Uruguay' },
  { code: 'MX', alpha3: 'MEX', name: 'Mexico' },
  { code: 'JP', alpha3: 'JPN', name: 'Japan' },
  { code: 'KR', alpha3: 'KOR', name: 'South Korea' },
  { code: 'CN', alpha3: 'CHN', name: 'China' },
  { code: 'SG', alpha3: 'SGP', name: 'Singapore' },
  { code: 'MY', alpha3: 'MYS', name: 'Malaysia' },
  { code: 'PH', alpha3: 'PHL', name: 'Philippines' },
  { code: 'ID', alpha3: 'IDN', name: 'Indonesia' },
  { code: 'TH', alpha3: 'THA', name: 'Thailand' },
  { code: 'VN', alpha3: 'VNM', name: 'Vietnam' },
  { code: 'FK', alpha3: 'FLK', name: 'Falkland Islands' },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const BY_ALPHA3 = new Map(COUNTRIES.map((c) => [c.alpha3, c]));

export function countryByCode(code: string | null | undefined): Country | null {
  return code ? (BY_CODE.get(code.toUpperCase()) ?? null) : null;
}

/** "gbr" (Search Console) → United Kingdom; an unknown code shows as itself. */
export function countryNameFromAlpha3(alpha3: string): string {
  return BY_ALPHA3.get(alpha3.toUpperCase())?.name ?? alpha3.toUpperCase();
}

/** "GB" (Vercel) → United Kingdom; an unknown code shows as itself. */
export function countryNameFromCode(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  return BY_CODE.get(code.toUpperCase())?.name ?? code.toUpperCase();
}

/** Countries offered on the interest form: everywhere but the UK, by name. */
export const INTEREST_COUNTRIES: Country[] = COUNTRIES.filter((c) => c.code !== 'GB').sort((a, b) =>
  a.name.localeCompare(b.name),
);

/** Picked when their country is not in the list: stored as 'XX' plus the place they typed. */
export const OTHER_COUNTRY_CODE = 'XX';
