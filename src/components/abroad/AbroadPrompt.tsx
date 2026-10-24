'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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
 * leave). Shown once the visitor has been on the page a few seconds or has
 * scrolled into it; dismissed or taken, it stays away for a month. Never in
 * the native app, never when signed in, never on the funnel or the forms
 * (lib/abroadPrompt PROMPT_PATHS). ?abroad=1 forces it, for looking at it.
 *
 * Every show, dismissal and click is beaconed to /api/abroad-prompt and
 * read on /admin/seo/countries.
 */
export function AbroadPrompt() {
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  const forced = search?.get('abroad') === '1';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (!promptAllowedOn(pathname)) return;
    const html = document.documentElement;
    if (html.dataset.app === '1' || html.dataset.session === '1') return;
    if (!forced && recentlyDismissed()) return;

    let cancelled = false;
    let shown = false;
    const show = () => {
      if (cancelled || shown) return;
      shown = true;
      setVisible(true);
      beacon('shown', pathname);
    };
    const arm = () => {
      const timer = setTimeout(show, 6000);
      const onScroll = () => {
        const h = document.documentElement;
        if (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) > 0.35) show();
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', onScroll);
      };
    };

    let disarm: (() => void) | undefined;
    if (forced) {
      disarm = arm();
    } else {
      fetch('/api/geo', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { country?: string | null } | null) => {
          if (cancelled) return;
          const country = j?.country ?? null;
          // Unknown stays quiet: off Vercel there is no header, and a
          // prompt about abroad to everyone is the thing this avoids.
          if (country && country !== 'GB') disarm = arm();
        })
        .catch(() => {});
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

/** One anonymous key per tab session, so shows and clicks pair up. */
function sessionKey(): string {
  try {
    const k = 'ea:abroad-session';
    let v = sessionStorage.getItem(k);
    if (!v) {
      v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return 'anon';
  }
}

function beacon(event: PromptEvent, path: string) {
  try {
    const body = JSON.stringify({ event, path, session: sessionKey() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/abroad-prompt', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/abroad-prompt', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* a lost beacon is a lost count, nothing more */
  }
}
