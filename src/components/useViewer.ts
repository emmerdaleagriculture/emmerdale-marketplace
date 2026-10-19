'use client';

import { useEffect, useState } from 'react';

/**
 * Who is looking at this page, resolved in the browser so pages wearing the
 * site header and footer stay statically cacheable.
 *
 * Contractors and customers share one auth system but not one site: a
 * customer shown "Jobs to price" and "Won jobs" is looking at somebody else's
 * business. The role comes from which profile row the user can read of their
 * own (RLS: contractors_select_own, customers_select_own). "account" is a
 * signed-in user with neither — an admin, or a contractor mid-onboarding.
 *
 * No `sb-` cookie means no session, so nothing is loaded — the anonymous
 * visitor, who is nearly everyone, never pays for the Supabase client. The
 * lookup is shared between header and footer: one request per page load.
 */
export type ViewerRole = 'contractor' | 'customer' | 'both' | 'account';
/** A contractor's paid tier, or null when they are on the free plan. */
export type Membership = 'premium' | 'open' | null;
export type Viewer =
  | { signedIn: false }
  | { signedIn: true; role: ViewerRole; membership: Membership };

const SIGNED_OUT: Viewer = { signedIn: false };

// Shared only between the header and footer of one render, never across
// navigations: a login or onboarding finishes with a client-side redirect, and
// a lookup remembered from before it would keep showing the old links.
const SHARE_MS = 2000;
let pending: Promise<Viewer> | null = null;
let pendingAt = 0;

function loadViewer(): Promise<Viewer> {
  if (!/(^|;\s*)sb-[^=]+=/.test(document.cookie)) return Promise.resolve(SIGNED_OUT);
  if (pending && Date.now() - pendingAt > SHARE_MS) pending = null;
  if (!pending) pendingAt = Date.now();
  pending ??= import('@/lib/supabase/client')
    .then(async ({ createClient }) => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return SIGNED_OUT;
      const [contractor, customer, sub] = await Promise.all([
        supabase
          .from('contractors')
          .select('id, premium_comped_until, open_comped_until')
          .eq('id', data.user.id)
          .maybeSingle(),
        supabase.from('customers').select('id').eq('id', data.user.id).maybeSingle(),
        supabase.from('subscriptions').select('status, tier').eq('contractor_id', data.user.id).maybeSingle(),
      ]);
      const role: ViewerRole =
        contractor.data && customer.data
          ? 'both'
          : contractor.data
            ? 'contractor'
            : customer.data
              ? 'customer'
              : 'account';
      // The same reading as the dashboard badge: a live Stripe subscription
      // (past_due still counts — the card is being retried) or a comped
      // period that has not run out.
      const now = Date.now();
      const comped = (until: string | null | undefined) => Boolean(until && new Date(until).getTime() > now);
      const subLive = sub.data?.status === 'active' || sub.data?.status === 'past_due';
      const membership: Membership = !contractor.data
        ? null
        : (subLive && sub.data?.tier === 'open') || comped(contractor.data.open_comped_until)
          ? 'open'
          : subLive || comped(contractor.data.premium_comped_until)
            ? 'premium'
            : null;
      return { signedIn: true, role, membership } as Viewer;
    })
    .catch(() => {
      pending = null;
      return SIGNED_OUT;
    });
  return pending;
}

export function useViewer(): Viewer {
  const [viewer, setViewer] = useState<Viewer>(SIGNED_OUT);
  useEffect(() => {
    let cancelled = false;
    loadViewer().then((v) => {
      if (!cancelled) setViewer(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return viewer;
}
