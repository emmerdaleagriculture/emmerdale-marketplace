'use server';

import { redirect } from 'next/navigation';
import { getUser, safeInternalPath } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { addSite, lookupLand, nearestPostcode, type LandLookup } from '@/lib/customers/sites';
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
  return { ok: true, lookup, typed: postcode };
}

/** Save it as one of the customer's sites and move on. */
export async function saveSiteAction(_prev: LandState, formData: FormData): Promise<LandState> {
  const user = await getUser();
  if (!user) redirect('/app');
  const postcode = String(formData.get('postcode') || '').trim();
  const lookup = postcode ? await lookupLand(postcode) : null;
  if (!lookup) return { error: 'Start again with the postcode.' };
  const label = String(formData.get('label') || '').trim().slice(0, 60) || 'Home paddock';
  const acresRaw = String(formData.get('acres') || '').trim();
  const acres = acresRaw ? Math.min(99999, Math.max(0, Number(acresRaw.replace(/[^\d.]/g, '')))) : null;

  // The row the site hangs off: a contractor booking work for the first
  // time may not have one yet.
  const admin = createServiceRoleClient();
  await admin.from('customers').upsert({ id: user.id, email: user.email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });

  const id = await addSite(user.id, {
    label,
    postcode: lookup.postcode,
    countyId: lookup.countyId,
    lat: lookup.lat,
    lng: lookup.lng,
    acres: Number.isFinite(acres as number) ? acres : null,
  });
  if (!id) return { error: 'That didn’t save. Please try again.' };
  const next = safeInternalPath(String(formData.get('next') || ''));
  redirect(next && !next.startsWith('/app/location') ? next : '/app/continue');
}
