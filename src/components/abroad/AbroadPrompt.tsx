'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { sessionKey } from '@/components/PageTracker';
import { hasSession } from '@/components/useViewer';
import {
  PROMPT_DISMISSED_DAYS,
  PROMPT_DISMISSED_KEY,
  PROMPT_SOURCE_SUFFIX,
  promptAllowedOn,
  type PromptEvent,
} from '@/lib/abroadPrompt';
import s from './abroad.module.css';

/**
 * The invitation to visitors outside the UK: two sign-up links, one for
 * people with land work to be done and one for people who do it, both to
 * the waiting list at /outside-the-uk. Phase 0 of going worldwide: the
 * waiting list is the measure of demand, and this is how it gets filled.
 *
 * Country-aware, because the country is already on every request: a UK
 * visitor in the job funnel never sees it (it costs nothing to check, and a
 * prompt about abroad under a Hampshire customer's nose is a reason to
 * leave). The country is asked for once per tab (/api/geo, kept in
 * sessionStorage). Shown once per tab, after a few seconds on the page or a
 * third of it scrolled; closed or taken, it stays away for a month. Never in
 * the native app, never with a session cookie, never on the funnel or the
 * forms (lib/abroadPrompt PROMPT_PATHS). ?abroad=1 forces it, for looking.
 *
 * Shows, closes and clicks are beaconed to /api/abroad-prompt under the
 * same session key as the landing-page tracker, so they are not extra
 * visits on /admin/abroad, and not at all for a visitor who has asked not
 * to be tracked (the same signals PageTracker honours).
 */
export function AbroadPrompt() {
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  const forced = search?.get('abroad') === '1';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (!promptAllowedOn(pathname)) return;
    if (document.documentElement.dataset.app === '1' || hasSession()) return;
    if (!forced && (recentlyDismissed() || shownThisTab())) return;

    let cancelled = false;
    let disarm: (() => void) | undefined;
    const show = () => {
      if (cancelled) return;
      markShownThisTab();
      setVisible(true);
      beacon('shown', pathname);
      disarm?.();
    };
    const arm = () => {
      const timer = setTimeout(show, 6000);
      const onScroll = () => {
        const h = document.documentElement;
        if (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) > 0.35) show();
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      disarm = () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', onScroll);
      };
    };

    if (forced) {
      arm();
    } else {
      visitorCountry().then((country) => {
        if (cancelled) return;
        // Unknown stays quiet: off Vercel there is no header, and a prompt
        // about abroad to everyone is the thing this avoids.
        if (country && country !== 'GB') arm();
      });
    }
    return () => {
      cancelled = true;
      disarm?.();
    };
  }, [pathname, forced]);

  if (!visible) return null;

  const from = encodeURIComponent(`${pathname}${PROMPT_SOURCE_SUFFIX}`);
  const dismiss = () => {
    remember();
    setVisible(false);
    beacon('dismissed', pathname);
  };
  const taken = (side: 'customer' | 'contractor') => {
    remember();
    beacon(side, pathname);
  };

  return (
    <div className={s.root} role="dialog" aria-labelledby="abroad-prompt-title">
      <div className={s.card}>
        <div className={s.head}>
          <div>
            <p className={s.eyebrow}>Outside the UK?</p>
            <h2 className={s.title} id="abroad-prompt-title">
              We’re working out where to open next.
            </h2>
          </div>
          <button type="button" className={s.close} onClick={dismiss} aria-label="Close">
            ×
          </button>
        </div>
        <p className={s.body}>
          We cover the UK today. Tell us where you are and we’ll let you know the moment we open
          there.
        </p>
        <div className={s.choices}>
          <a
            className={s.choice}
            href={`/outside-the-uk?side=customer&from=${from}`}
            onClick={() => taken('customer')}
          >
            <span>
              <strong>Looking for work done?</strong>
              <span>Land to be topped, cut, fenced or cleared.</span>
            </span>
            <span className={s.go}>Sign up →</span>
          </a>
          <a
            className={s.choice}
            href={`/outside-the-uk?side=contractor&from=${from}`}
            onClick={() => taken('contractor')}
          >
            <span>
              <strong>Doing the work?</strong>
              <span>A contractor who wants the first jobs there.</span>
            </span>
            <span className={s.go}>Sign up →</span>
          </a>
        </div>
      </div>
    </div>
  );
}

const SHOWN_KEY = 'ea:abroad-shown';
const COUNTRY_KEY = 'ea:country';

/** The visitor's country for this tab: one request, then sessionStorage. */
async function visitorCountry(): Promise<string | null> {
  try {
    const cached = sessionStorage.getItem(COUNTRY_KEY);
    if (cached) return cached === '-' ? null : cached;
  } catch {
    /* no storage: ask every time, which is still one request per page */
  }
  try {
    const r = await fetch('/api/geo', { cache: 'no-store' });
    const j = r.ok ? ((await r.json()) as { country?: string | null }) : null;
    const country = j?.country ?? null;
    try {
      sessionStorage.setItem(COUNTRY_KEY, country ?? '-');
    } catch {
      /* fine */
    }
    return country;
  } catch {
    return null;
  }
}

function shownThisTab(): boolean {
  try {
    return sessionStorage.getItem(SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}
function markShownThisTab() {
  try {
    sessionStorage.setItem(SHOWN_KEY, '1');
  } catch {
    /* fine */
  }
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(PROMPT_DISMISSED_KEY) || 0);
    return at > 0 && Date.now() - at < PROMPT_DISMISSED_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(PROMPT_DISMISSED_KEY, String(Date.now()));
  } catch {
    /* private mode: it will show again next visit, which is fine */
  }
}

function beacon(event: PromptEvent, path: string) {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
    if (nav.globalPrivacyControl === true || nav.doNotTrack === '1') return;
    const session = sessionKey();
    if (!session) return;
    const body = JSON.stringify({ event, path, session });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/abroad-prompt', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/abroad-prompt', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* a lost beacon is a lost count, nothing more */
  }
}
