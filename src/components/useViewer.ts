'use client';

import { useEffect, useState } from 'react';
import { membershipOf, type Membership } from '@/lib/membership';

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
export type { Membership };
export type Viewer =
  | { signedIn: false }
  | { signedIn: true; role: ViewerRole; membership: Membership };

const SIGNED_OUT: Viewer = { signedIn: false };

/**
 * The header no longer swaps from signed-out to signed-in in front of you.
 * The root layout marks html[data-session] before paint when a session
 * cookie exists, and globals.css keeps every [data-viewer-slot] invisible
 * until html[data-viewer] says the viewer is known. The last viewer is kept
 * in localStorage so a returning visitor's header resolves on hydration
 * instead of after the network round trip; the fresh lookup still runs and
 * corrects it. It is a convenience only: unreadable storage just means the
 * slot waits for the lookup.
 */
const CACHE_KEY = 'ea-viewer';
const HAS_SESSION = /(^|;\s*)sb-[^=]+=/;

function readCached(): Viewer | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const v = raw ? (JSON.parse(raw) as Viewer) : null;
    return v?.signedIn ? v : null;
  } catch {
    return null;
  }
}

function writeCached(v: Viewer) {
  try {
    if (v.signedIn) localStorage.setItem(CACHE_KEY, JSON.stringify(v));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage blocked: the slot waits for the lookup instead */
  }
}

function markKnown() {
  document.documentElement.setAttribute('data-viewer', 'known');
}

// Shared only between the header and footer of one render, never across
// navigations: a login or onboarding finishes with a client-side redirect, and
// a lookup remembered from before it would keep showing the old links.
const SHARE_MS = 2000;
let pending: Promise<Viewer> | null = null;
let pendingAt = 0;

function loadViewer(): Promise<Viewer> {
  if (!HAS_SESSION.test(document.cookie)) {
    writeCached(SIGNED_OUT);
    return Promise.resolve(SIGNED_OUT);
  }
  if (pending && Date.now() - pendingAt > SHARE_MS) pending = null;
  if (!pending) pendingAt = Date.now();
  pending ??= import('@/lib/supabase/client')
    .then(async ({ createClient }) => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        writeCached(SIGNED_OUT);
        return SIGNED_OUT;
      }
      // The subscription rides along on the contractor row (one-to-one over
      // its primary key), so a customer or admin pays for no extra request
      // and a contractor for no extra round trip. Both rows are RLS-own.
      const [contractor, customer] = await Promise.all([
        supabase
          .from('contractors')
          .select('id, premium_comped_until, open_comped_until, subscriptions(status, tier)')
          .eq('id', data.user.id)
          .maybeSingle(),
        supabase.from('customers').select('id').eq('id', data.user.id).maybeSingle(),
      ]);
      const role: ViewerRole =
        contractor.data && customer.data
          ? 'both'
          : contractor.data
            ? 'contractor'
            : customer.data
              ? 'customer'
              : 'account';
      const sub = contractor.data?.subscriptions;
      const membership: Membership = contractor.data
        ? membershipOf(Array.isArray(sub) ? sub[0] : sub, contractor.data)
        : null;
      const viewer = { signedIn: true, role, membership } as Viewer;
      writeCached(viewer);
      return viewer;
    })
    .catch(() => {
      pending = null;
      return SIGNED_OUT;
    });
  return pending;
}

/**
 * `known` is a viewer a parent has already resolved: nothing is loaded and
 * it is returned as is, so a header handed down to a child nav does not
 * flash signed-out and look the user up a second time.
 */
export function useViewer(known?: Viewer): Viewer {
  const [viewer, setViewer] = useState<Viewer>(SIGNED_OUT);
  useEffect(() => {
    if (known) return;
    let cancelled = false;
    const cached = HAS_SESSION.test(document.cookie) ? readCached() : null;
    if (cached) {
      setViewer(cached);
      markKnown();
    }
    loadViewer().then((v) => {
      if (cancelled) return;
      setViewer(v);
      markKnown();
    });
    return () => {
      cancelled = true;
    };
  }, [known]);
  return known ?? viewer;
}

/** Has a contractor profile (possibly a customer one too). */
export function isContractor(v: Viewer): boolean {
  return v.signedIn && (v.role === 'contractor' || v.role === 'both');
}

/** Has a customer profile (possibly a contractor one too). */
export function isCustomer(v: Viewer): boolean {
  return v.signedIn && (v.role === 'customer' || v.role === 'both');
}
