'use server';

import sharp from 'sharp';
import { revalidatePath } from 'next/cache';
import { requireBooksWriter } from '@/lib/books/server';
import { LOGO_BOX, LOGO_BUCKET, LOGO_MAX_UPLOAD_BYTES, MIN_CONTRAST, normaliseHex, readableColour } from '@/lib/books/branding';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

function revalidate() {
  revalidatePath('/account/books', 'layout');
}

/**
 * The invoice logo. Whatever arrives (PNG, JPEG, WebP, SVG…) is decoded and
 * re-encoded here as a PNG fitted inside 800×300, transparency kept and
 * metadata stripped; the PDF renderer only reads PNG and JPEG. A file sharp
 * can't read is refused rather than stored. Each upload gets a fresh path so
 * no cache serves the old logo, and the previous object is removed.
 */
export async function uploadLogoAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const ledger = gate.ledger;

  const file = fd.get('logo');
  if (!(file instanceof File) || file.size < 64) return { error: 'Choose your logo to upload.' };
  if (file.size > LOGO_MAX_UPLOAD_BYTES) return { error: 'That file is too big. Try one under 5MB.' };

  let png: Buffer;
  let size: { width: number; height: number };
  try {
    const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000, density: 300 })
      .rotate()
      .resize(LOGO_BOX.width, LOGO_BOX.height, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer({ resolveWithObject: true });
    png = data;
    size = { width: info.width, height: info.height };
  } catch {
    return { error: 'We couldn’t read that image. Try a PNG or JPEG.' };
  }

  const admin = createServiceRoleClient();
  // The size rides in the name so the email can give Outlook a fixed width.
  const path = `${ledger.id}/${Date.now()}-${size.width}x${size.height}.png`;
  const { error: upErr } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(path, png, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
  if (upErr) {
    console.error('[books] logo upload failed', { ledger: ledger.id, error: upErr.message });
    return { error: 'That didn’t go through. Please try again.' };
  }
  const { error: rowErr } = await admin.from('books_ledgers').update({ invoice_logo_path: path }).eq('id', ledger.id);
  if (rowErr) {
    console.error('[books] logo row update failed', { ledger: ledger.id, error: rowErr.message });
    await admin.storage.from(LOGO_BUCKET).remove([path]);
    return { error: 'That didn’t go through. Please try again.' };
  }
  if (ledger.invoice_logo_path) await admin.storage.from(LOGO_BUCKET).remove([ledger.invoice_logo_path]);
  revalidate();
  return { ok: true, message: 'Logo saved.' };
}

export async function removeLogoAction(): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  const old = gate.ledger?.invoice_logo_path;
  if (!gate.ledger || !old) return { ok: true };
  const admin = createServiceRoleClient();
  const { error } = await admin.from('books_ledgers').update({ invoice_logo_path: null }).eq('id', gate.ledger.id);
  if (error) return { error: 'That didn’t go through. Please try again.' };
  await admin.storage.from(LOGO_BUCKET).remove([old]);
  revalidate();
  return { ok: true, message: 'Logo removed.' };
}

/** The accent colour; blank resets to ours. */
export async function saveColourAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const raw = fd.get('use_default') ? '' : String(fd.get('colour') ?? '').trim();
  const hex = raw ? normaliseHex(raw) : null;
  if (raw && !hex) return { error: 'Enter the colour as a hex code, like #1f4d2b.' };
  if (hex && !readableColour(hex)) {
    return { error: `That colour is too pale to read on white paper (it needs ${MIN_CONTRAST}:1 contrast). Try a darker shade.` };
  }
  const { error } = await createServiceRoleClient().from('books_ledgers').update({ invoice_colour: hex }).eq('id', gate.ledger.id);
  if (error) return { error: 'That didn’t save. Please try again.' };
  revalidate();
  return { ok: true, message: hex ? 'Colour saved.' : 'Back to Emmerdale green.' };
}
