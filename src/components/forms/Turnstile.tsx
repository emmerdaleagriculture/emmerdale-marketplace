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

// Trimmed defensively: a stray space pasted into the env var makes render()
// throw "Invalid input for parameter sitekey" and silently kills the widget.
const SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();

/** True when the widget will render — forms should hold submits until a token exists. */
export const turnstileEnabled = Boolean(SITE_KEY);

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
 *
 * Tokens expire 300s after issuance — on long forms the token minted at page
 * load is dead by the time the user submits. `onToken` reports every token
 * change ('' while none is held) so forms can disable submit until one exists.
 */
export function Turnstile({
  resetOn,
  onToken,
}: {
  resetOn?: unknown;
  onToken?: (token: string) => void;
}) {
  const siteKey = SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || widgetIdRef.current !== null) return;
        widgetIdRef.current = window.turnstile!.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          // Auto re-solve when the token times out mid-form; the callbacks keep
          // the form's view of the token in sync either way.
          'refresh-expired': 'auto',
          callback: (token: string) => onTokenRef.current?.(token),
          'expired-callback': () => onTokenRef.current?.(''),
          'error-callback': () => onTokenRef.current?.(''),
        });
      })
      .catch((err) => {
        // Leave the form usable; Supabase will reject the submit if it
        // requires a captcha token, and the action surfaces that error. But
        // never swallow this silently — a synchronous render() throw (bad
        // sitekey) is otherwise invisible and takes down every auth form.
        console.error('[turnstile] widget failed to render:', err);
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
    if (widgetIdRef.current !== null) {
      // A reset clears the held token until the new challenge completes.
      onTokenRef.current?.('');
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, [resetOn]);

  if (!siteKey) return null;
  return <div ref={containerRef} style={{ marginBottom: 16 }} />;
}
