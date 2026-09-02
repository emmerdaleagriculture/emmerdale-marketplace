/**
 * Site-wide constants for Emmerdale Marketplace.
 *
 * The marketplace is the parent brand: Emmerdale Agriculture Ltd — the company
 * behind Hampshire Paddock Management. Copy register mirrors the HPM site
 * (confident, concrete, italic emphasis on the final phrase of headings).
 */
export const SITE_NAME = 'Emmerdale Agriculture';
export const SITE_STRAPLINE = 'The contractor network';

// Footer strapline, in the HPM register ("Paddocks, put right.").
export const SITE_FOOTER_STRAPLINE = 'Work, passed on properly.';

// Emmerdale Agriculture Group Ltd — the spin-off company this project belongs
// to. NOT Emmerdale Agriculture Ltd (14950816), which is a different,
// pre-existing company. The number is null until incorporation completes; set
// it here and every "Company No." line on the site picks it up.
export const COMPANY_LEGAL_NAME = 'Emmerdale Agriculture Group Ltd';
export const COMPANY_NUMBER: string | null = null;

/** "Emmerdale Agriculture Group Ltd · Company No. 12345678" (number omitted while pending). */
export const COMPANY_REG_LINE = COMPANY_NUMBER
  ? `${COMPANY_LEGAL_NAME} · Company No. ${COMPANY_NUMBER}`
  : COMPANY_LEGAL_NAME;

/** "Emmerdale Agriculture Group Ltd (Company No. 12345678)" for running prose. */
export const COMPANY_REG_PROSE = COMPANY_NUMBER
  ? `${COMPANY_LEGAL_NAME} (Company No. ${COMPANY_NUMBER})`
  : COMPANY_LEGAL_NAME;

// The sibling site the network exists alongside.
export const HPM_URL = 'https://hampshirepaddockmanagement.com';
export const HPM_CONTACT_URL = 'https://hampshirepaddockmanagement.com/contact';

export const SITE_LOCATION_LINE = 'Made with care in Hampshire';

// Front-page contact details. Display form and tel: form kept together so the
// two can't drift apart.
export const PHONE_DISPLAY = '07825 156062';
export const PHONE_TEL = '+447825156062';

export const COMPANY_ADDRESS_LINES = [
  'The Old Poultry Shed, Upper Slackstead Farm,',
  'Farley Lane, Braishfield, Hampshire, SO51 0QL',
] as const;

/**
 * Where the network actually operates. One constant because the claim appears
 * in schema.org `areaServed`, page metadata, FAQ answers and body copy — it
 * read "England and Wales" in twenty places while the counties table has
 * carried 32 Scottish council areas (with an approved contractor covering all
 * of them) and every one has had an indexable county page. Structured data
 * that contradicts the pages it sits on is worse than no structured data.
 *
 * Great Britain, not the UK: there are no Northern Ireland rows.
 */
export const SERVICE_AREA = 'England, Wales and Scotland';

/** The same claim where a sentence needs it short — "across Britain". */
export const SERVICE_AREA_SHORT = 'Britain';

const FALLBACK_SITE_URL = 'https://emmerdaleagriculture.com';

/**
 * The site's canonical origin, without a trailing slash.
 *
 * Every canonical URL, JSON-LD `url`, sitemap entry and absolute email link is
 * built from this one variable, so an unset or dev value in a production build
 * silently points the whole site at the wrong origin — the sort of failure
 * that costs weeks of indexing before anyone notices. A localhost value in a
 * production build is therefore ignored (loudly) rather than honoured.
 */
export function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (!raw) return FALLBACK_SITE_URL;
  if (
    process.env.NODE_ENV === 'production' &&
    /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(raw)
  ) {
    console.warn(
      `[site] NEXT_PUBLIC_SITE_URL is "${raw}" in a production build — ignoring it ` +
        `and using ${FALLBACK_SITE_URL}. Set it correctly in the hosting environment.`,
    );
    return FALLBACK_SITE_URL;
  }
  return raw;
}
