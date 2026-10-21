'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
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
 * The last viewer is kept in localStorage with the user id it belongs to.
 * Before paint, the root layout marks html[data-session] (and the cached
 * role) when there is a session cookie AND a cached viewer, and globals.css
 * keeps every [data-viewer-slot] invisible until html[data-viewer] says the
 * viewer is known. On hydration the cache answers at once, but only for the
 * same user the cookie holds; the fresh lookup still runs and corrects it.
 *
 * A session cookie without a cache (first sign-in on a device, or a stale
 * cookie after the session died) hides nothing, so a signed-out visitor
 * never waits on a blank header. Storage is a convenience only: unreadable
 * storage just means the old swap.
 */
const CACHE_KEY = 'ea-viewer';
/** The auth cookie itself (chunked .0, .1 … when large), not the PKCE verifier. */
const SESSION_COOKIE_NAME = /^sb-[^=]*-auth-token(?:\.\d+)?$/;
type Cached = { uid: string; viewer: Viewer };

function cookies(): [string, string][] {
  return document.cookie
    .split(/;\s*/)
    .filter(Boolean)
    .map((c) => {
      const i = c.indexOf('=');
      return [c.slice(0, i), c.slice(i + 1)];
    });
}

function hasSession(): boolean {
  return cookies().some(([n]) => SESSION_COOKIE_NAME.test(n));
}

function b64(s: string): string {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

/**
 * Whose session the cookie holds — the access token's subject, read locally
 * (@supabase/ssr stores the session as "base64-" + JSON, chunked by name
 * suffix). null when it can't be read, which just means no cache.
 */
function sessionUid(): string | null {
  try {
    const parts = cookies()
      .filter(([n]) => SESSION_COOKIE_NAME.test(n))
      .sort(([x], [y]) => (Number(x.match(/\.(\d+)$/)?.[1]) || 0) - (Number(y.match(/\.(\d+)$/)?.[1]) || 0));
    if (!parts.length) return null;
    let raw = decodeURIComponent(parts.map(([, v]) => v).join(''));
    if (raw.startsWith('base64-')) raw = b64(raw.slice(7));
    const token = String(JSON.parse(raw).access_token ?? '');
    const sub = JSON.parse(b64(token.split('.')[1] ?? '')).sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

// One read per page load, not one per header/footer/widget using the hook.
let memo: { cookie: string; viewer: Viewer | null } | null = null;

function readCached(): Viewer | null {
  const cookie = document.cookie;
  if (memo?.cookie === cookie) return memo.viewer;
  let viewer: Viewer | null = null;
  try {
    // Back from Stripe: the membership has just changed, so the cache is
    // the one thing guaranteed to be wrong. Wait for the lookup.
    const fromCheckout = new URLSearchParams(location.search).has('sub');
    const uid = !fromCheckout && hasSession() ? sessionUid() : null;
    const raw = uid ? localStorage.getItem(CACHE_KEY) : null;
    const c = raw ? (JSON.parse(raw) as Cached) : null;
    viewer = c && c.uid === uid && c.viewer?.signedIn ? c.viewer : null;
  } catch {
    viewer = null;
  }
  memo = { cookie, viewer };
  return viewer;
}

function writeCached(uid: string, viewer: Viewer) {
  memo = null;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid, viewer } satisfies Cached));
  } catch {
    /* storage blocked: the next page waits for the lookup instead */
  }
}

function clearCached() {
  memo = null;
  try {
    if (localStorage.getItem(CACHE_KEY) !== null) localStorage.removeItem(CACHE_KEY);
  } catch {
    /* nothing to clear */
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

/** A lookup that couldn't tell (network down, a query failed): not "signed out". */
class Inconclusive extends Error {}

function loadViewer(): Promise<Viewer> {
  if (!hasSession()) {
    clearCached();
    return Promise.resolve(SIGNED_OUT);
  }
  if (pending && Date.now() - pendingAt > SHARE_MS) pending = null;
  if (!pending) pendingAt = Date.now();
  pending ??= import('@/lib/supabase/client')
    .then(async ({ createClient }) => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (!data.user) {
        // getUser reports a failed fetch as "no user" with an error; only a
        // session the server rejected means signed out.
        if (error?.name === 'AuthRetryableFetchError') throw new Inconclusive(error.message);
        clearCached();
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
      // A failed read would otherwise make a contractor an "account".
      if (contractor.error || customer.error) throw new Inconclusive('profile lookup failed');
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
      writeCached(data.user.id, viewer);
      return viewer;
    })
    .catch(() => {
      // Couldn't tell: keep what this same user was last seen as, rather
      // than swap a correct header for the signed-out one.
      pending = null;
      return readCached() ?? SIGNED_OUT;
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
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    if (known) return;
    let cancelled = false;
    const cached = readCached();
    if (cached) {
      setViewer(cached);
      setResolved(true);
    }
    loadViewer().then((v) => {
      if (cancelled) return;
      setViewer(v);
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [known]);
  // Revealed after the render that shows the resolved viewer has reached the
  // DOM and before it paints: marking it beside setViewer let the old header
  // show for a frame before React drew the new one.
  useLayoutEffect(() => {
    if (resolved) markKnown();
  }, [resolved]);
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
