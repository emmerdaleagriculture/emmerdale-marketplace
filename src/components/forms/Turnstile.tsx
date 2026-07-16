'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load Turnstile')));
  });
}

/**
 * Cloudflare Turnstile widget. Renders nothing when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, so forms keep working before the
 * keys are configured (and Supabase captcha enforcement is still off).
 *
 * The widget injects a hidden `cf-turnstile-response` input into the enclosing
 * form; server actions forward it to Supabase as `captchaToken`. Supabase
 * verifies the token — the app must never call siteverify itself, because
 * tokens are single-use.
 *
 * Pass the server action's state as `resetOn`: tokens are also consumed by a
 * failed submit, so the widget must mint a fresh one before a retry.
 */
export function Turnstile({ resetOn }: { resetOn?: unknown }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || widgetIdRef.current !== null) return;
        widgetIdRef.current = window.turnstile!.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
        });
      })
      .catch(() => {
        // Leave the form usable; Supabase will reject the submit if it
        // requires a captcha token, and the action surfaces that error.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current);
  }, [resetOn]);

  if (!siteKey) return null;
  return <div ref={containerRef} style={{ marginBottom: 16 }} />;
}
