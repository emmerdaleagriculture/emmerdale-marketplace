import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption for the few secrets Books keeps: the company's TinyTax API key,
 * Government Gateway login and Companies House authentication code (see
 * filing.server.ts). AES-256-GCM with a key from BOOKS_SECRETS_KEY (32 bytes,
 * base64), never stored in the database. The ledger id is bound in as
 * associated data, so a blob copied onto another ledger won't decrypt.
 *
 * Format: "v1.<iv>.<tag>.<ciphertext>", each part base64url.
 */

const VERSION = 'v1';

function key(): Buffer {
  const raw = process.env.BOOKS_SECRETS_KEY;
  if (!raw) throw new Error('BOOKS_SECRETS_KEY is not set');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('BOOKS_SECRETS_KEY must be 32 bytes, base64');
  return k;
}

export function secretsConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function seal(plain: string, ledgerId: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  c.setAAD(Buffer.from(ledgerId));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [VERSION, iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

/** The plain text, or null if the blob is missing, tampered with, or from another ledger. */
export function unseal(blob: string | null | undefined, ledgerId: string, k: Buffer = key()): string | null {
  if (!blob) return null;
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== VERSION || !iv || !tag || ct === undefined) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
    d.setAAD(Buffer.from(ledgerId));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
