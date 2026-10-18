'use server';

import { redirect } from 'next/navigation';
import { getUser, safeInternalPath } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { addSite, lookupLand, nearestPostcode, type LandLookup } from '@/lib/customers/sites';
import { normalisePostcode } from '@/lib/postcodes';
import { nameFromUser } from '@/lib/app/userName';
import type { FormState } from '@/lib/form';

export type LandState = FormState & { lookup?: LandLookup; typed?: string };

/** A postcode, or a position from the phone, becomes a place and a coverage count. */
export async function lookupLandAction(_prev: LandState, formData: FormData): Promise<LandState> {
  const user = await getUser();
  if (!user) redirect('/app');
  let postcode = String(formData.get('postcode') || '').trim();
  const lat = Number(formData.get('lat'));
  const lng = Number(formData.get('lng'));
  if (!postcode && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) {
    const near = await nearestPostcode(lat, lng);
    if (!near) return { error: 'We could not turn that location into a postcode. Type it instead.' };
    postcode = near;
  }
  if (!postcode) return { error: 'Enter a postcode.' };
  const lookup = await lookupLand(postcode);
  if (!lookup) return { error: 'That doesn’t look like a UK postcode. Check it and try again.', typed: postcode };
  if (lookup.error) return { error: 'The postcode service isn’t answering just now. Try again in a moment.', typed: postcode };
  return { ok: true, lookup, typed: postcode };
}

/** Save it as one of the customer's sites and move on. */
export async function saveSiteAction(_prev: LandState, formData: FormData): Promise<LandState> {
  const user = await getUser();
  if (!user) redirect('/app');
  // What the lookup found, carried from the form; only the postcode's shape
  // is checked again, so a lookup-service blip cannot dead-end the save.
  const postcode = String(formData.get('postcode') || '').trim();
  const norm = normalisePostcode(postcode);
  if (!norm.full) return { error: 'Enter the full postcode (like SO41 8AB) to save this field.' };
  const num = (k: string) => { const v = Number(formData.get(k)); return Number.isFinite(v) && String(formData.get(k) ?? '') !== '' ? v : null; };
  const countyId = num('county_id');
  const lat = num('lat');
  const lng = num('lng');
  const label = String(formData.get('label') || '').trim().slice(0, 60) || (first(formData) ? 'Home paddock' : 'Another field');
  const acresRaw = String(formData.get('acres') || '').trim();
  if (acresRaw && !/^\d+(\.\d+)?$/.test(acresRaw)) return { error: 'Acres should be a number, like 4 or 2.5.' };
  const acres = acresRaw ? Math.min(99999, Number(acresRaw)) : null;

  // The row the site hangs off: a contractor booking work for the first
  // time may not have one yet.
  const admin = createServiceRoleClient();
  const { error: custErr } = await admin.from('customers').upsert(
    { id: user.id, email: user.email ?? '', contact_name: nameFromUser(user.user_metadata), phone: user.phone ? `+${user.phone.replace(/^\+/, '')}` : null },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (custErr) {
    console.error('[sites] customer row failed:', custErr.message);
    return { error: 'That didn’t save. Please try again.' };
  }

  const id = await addSite(user.id, {
    label,
    postcode: norm.full,
    countyId: countyId == null ? null : Math.trunc(countyId),
    lat,
    lng,
    acres,
  });
  if (!id) return { error: 'That didn’t save. Please try again.' };
  const next = safeInternalPath(String(formData.get('next') || ''));
  redirect(next && !next.startsWith('/app/location') ? next : '/app/continue');
}

/** Whether this is the customer's first site, for the default name. */
function first(formData: FormData): boolean {
  return String(formData.get('first') || '') === '1';
}
