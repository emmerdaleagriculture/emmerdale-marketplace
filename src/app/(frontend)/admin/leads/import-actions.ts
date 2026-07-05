'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import type { FormState } from '@/lib/form';
import type { Json } from '@/lib/database.types';

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
}

// ── Manual single lead ──────────────────────────────────────────────────────
export async function addLeadManualAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  const full_name = String(formData.get('full_name') || '').trim();
  if (!full_name) return { error: 'Name is required.' };

  const admin = createServiceRoleClient();
  const { error } = await admin.from('leads').insert({
    source: 'manual',
    full_name,
    phone: String(formData.get('phone') || '').trim() || null,
    email: String(formData.get('email') || '').trim() || null,
    postcode: String(formData.get('postcode') || '').trim() || null,
    job_hint: String(formData.get('job_hint') || '').trim() || null,
    details: { entered_by: 'admin' },
  });
  if (error) return { error: error.message };

  revalidatePath('/admin/leads');
  return { ok: true, message: `Added ${full_name} to the queue.` };
}

// ── CSV import (Facebook Leads export, or any CSV) ──────────────────────────
function parseCsv(text: string): Record<string, string>[] {
  text = text.replace(/^﻿/, ''); // strip BOM
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((x) => x.trim() !== ''));
  const header = nonEmpty.shift();
  if (!header) return [];
  return nonEmpty.map((r) =>
    Object.fromEntries(header.map((h, idx) => [h.trim(), (r[idx] ?? '').trim()])),
  );
}

// Standard Facebook lead columns — everything else is a custom question → hint.
const STD_COLS = new Set([
  'id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
  'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic', 'platform',
  'full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone',
  'post_code', 'postcode', 'postal_code', 'zip_code', 'zip', 'city', 'street_address',
]);

export async function importCsvAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  const file = formData.get('csv');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a CSV file to upload.' };
  }
  const rows = parseCsv(await file.text());
  if (rows.length === 0) return { error: 'No rows found in that file.' };

  const admin = createServiceRoleClient();
  const pick = (row: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find((kk) => kk.toLowerCase().replace(/\s+/g, '_') === k);
      if (found && row[found]) return row[found];
    }
    return null;
  };

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const fbId = pick(row, 'id');
    if (fbId) {
      const { data: dup } = await admin
        .from('leads')
        .select('id')
        .eq('details->>id', fbId)
        .maybeSingle();
      if (dup) { skipped++; continue; }
    }

    const fullName =
      pick(row, 'full_name', 'name') ??
      [pick(row, 'first_name'), pick(row, 'last_name')].filter(Boolean).join(' ').trim();
    if (!fullName) { skipped++; continue; }

    const extras = Object.entries(row)
      .filter(([k, v]) => v && !STD_COLS.has(k.toLowerCase().replace(/\s+/g, '_')))
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);

    const { error } = await admin.from('leads').insert({
      source: 'facebook_csv',
      full_name: fullName,
      phone: pick(row, 'phone_number', 'phone'),
      email: pick(row, 'email', 'email_address'),
      postcode: pick(row, 'post_code', 'postcode', 'postal_code', 'zip_code', 'zip'),
      job_hint: extras.join('\n') || null,
      details: row as Json,
    });
    if (error) { skipped++; continue; }
    imported++;
  }

  revalidatePath('/admin/leads');
  return {
    ok: true,
    message: `Imported ${imported} lead${imported === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} (duplicate or no name)` : ''}.`,
  };
}
