/**
 * Receipts by email: the pure parts. Each set of books has an address
 * receipts+<code>@<domain>; the code is found in whichever of the recipient
 * fields or delivery headers survived forwarding.
 */

export const DEFAULT_RECEIPTS_ADDRESS = 'receipts@emmerdaleagriculture.com';

export function receiptsAddress(code: string, base = process.env.BOOKS_RECEIPTS_ADDRESS || DEFAULT_RECEIPTS_ADDRESS): string {
  const [local, domain] = base.split('@');
  return `${local}+${code}@${domain}`;
}

const CODE = /receipts\+([0-9a-f]{12})@/i;

/** The first books code in any of the given address strings or header values. */
export function findInboundCode(values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const m = v ? CODE.exec(v) : null;
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** The bare address from a From header: "Dave <dave@x.com>" → "dave@x.com". */
export function bareAddress(from: string): string {
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(from);
  if (angled) return angled[1].toLowerCase();
  const plain = /([^\s<>,"']+@[^\s<>,"']+)/.exec(from);
  return (plain?.[1] ?? '').toLowerCase();
}

/** Tidy a list of allowed senders as typed: one per line or comma, lower case, valid-looking only. */
export function parseSenders(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const a = raw.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)) out.add(a);
  }
  return [...out].slice(0, 20);
}

export const EMAIL_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
/** Images smaller than this are logos, signatures and tracking pixels, not receipts. */
export const MIN_IMAGE_BYTES = 8000;
export const MAX_ATTACHMENTS = 10;

/** The type an attachment really is, trusting a .pdf name over a generic content type. */
export function attachmentType(contentType: string | null | undefined, filename: string | null | undefined): string | null {
  const ct = (contentType ?? '').toLowerCase().split(';')[0].trim();
  if (EMAIL_FILE_TYPES.includes(ct)) return ct;
  if (ct === 'image/jpg' || ct === 'image/pjpeg') return 'image/jpeg';
  if ((ct === 'application/octet-stream' || ct === '') && /\.pdf$/i.test(filename ?? '')) return 'application/pdf';
  return null;
}
