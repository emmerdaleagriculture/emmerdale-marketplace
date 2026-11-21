/**
 * Invoice branding (20261121120000): a logo and an accent colour per ledger,
 * used on the PDF, the customer's /i/<token> page and the invoice email.
 *
 * Client-safe: no server imports.
 */

export const LOGO_BUCKET = 'books-logos';
export const LOGO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Stored logos fit inside this box (never enlarged). */
export const LOGO_BOX = { width: 800, height: 300 } as const;

export const DEFAULT_INVOICE_COLOUR = '#1f4d2b';

/** Swatches offered in Settings; any other colour can be typed or picked. */
export const COLOUR_PRESETS: { hex: string; name: string }[] = [
  { hex: '#1f4d2b', name: 'Emmerdale green' },
  { hex: '#2f6b3a', name: 'Grass' },
  { hex: '#1d3f6e', name: 'Navy' },
  { hex: '#0f5e6b', name: 'Teal' },
  { hex: '#7a1f2b', name: 'Burgundy' },
  { hex: '#8a4b12', name: 'Rust' },
  { hex: '#4a3b2a', name: 'Brown' },
  { hex: '#2b2b2b', name: 'Charcoal' },
];

/** Lower-case #rrggbb, or null if it isn't one (#abc is widened). */
export function normaliseHex(input: string | null | undefined): string | null {
  const t = (input ?? '').trim().toLowerCase();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const long = /^#?([0-9a-f]{6})$/.exec(t);
  return long ? `#${long[1]}` : null;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio of a colour against white paper. */
export function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * The colour has to carry headings and white button text, so anything paler
 * than 4.5:1 against white is refused (yellows, pastels, light greys).
 */
export const MIN_CONTRAST = 4.5;

export function readableColour(hex: string): boolean {
  return contrastOnWhite(hex) >= MIN_CONTRAST;
}

/** The colour to draw with: the ledger's, if it is still readable, else ours. */
export function invoiceColour(ledger: { invoice_colour?: string | null }): string {
  const c = normaliseHex(ledger.invoice_colour);
  return c && readableColour(c) ? c : DEFAULT_INVOICE_COLOUR;
}

/**
 * The size stored in the logo's path (`<ledger>/<ms>-<w>x<h>.png`), fitted
 * inside a box, for an <img width height> that Outlook (which ignores
 * max-width) can't blow up. Null when the path carries no size.
 */
export function logoFit(path: string | null | undefined, maxW: number, maxH: number): { width: number; height: number } | null {
  const m = /-(\d+)x(\d+)\.png$/.exec(path ?? '');
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return null;
  const k = Math.min(1, maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}
