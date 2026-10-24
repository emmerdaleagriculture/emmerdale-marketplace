import { headers } from 'next/headers';

/**
 * Where a request came from, as Vercel sees it: the two-letter ISO country
 * on the x-vercel-ip-country header, set at the edge on every request. Null
 * off Vercel (local dev) or when the header is malformed. A country, not a
 * person: it is stored beside page and parse events for the question "is
 * anyone outside the UK trying to use this?" and for nothing else.
 */
export function countryFromHeader(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** The current server request's country. Server actions and route handlers. */
export async function requestCountry(): Promise<string | null> {
  try {
    const h = await headers();
    return countryFromHeader(h.get('x-vercel-ip-country'));
  } catch {
    return null;
  }
}
