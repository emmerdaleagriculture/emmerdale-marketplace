import type { ErrorEvent } from '@sentry/nextjs';

/**
 * Browser errors that are not ours, dropped before they reach Sentry.
 *
 * Facebook's and Instagram's in-app browsers inject their own scripts into
 * every page (most of our visitors arrive from Meta ads). Those scripts throw
 * on our pages — `window._META.IABInnerFrame`, `window.webkit.messageHandlers`
 * from `sendDataToNative`, an InvalidAccessError in `dispatchToBridge` — and
 * Sentry files each one under whatever page it happened on. Nothing we change
 * fixes them, and they crowded the admin Errors list (2026-11-11).
 *
 * The test is deliberately narrow: a known injected message or function name
 * AND no frame from our own bundle (/_next/). Our Capacitor bridge also reads
 * window.webkit.messageHandlers, so an error that passes through our code is
 * kept. "Load failed" network drops are kept too: they can mean a real outage.
 *
 * Also dropped: "Server Action … was not found on the server" and Next's newer
 * wording "Failed to find Server Action", a tab left open across a deploy
 * calling an action the new build no longer has; "Can't find variable:
 * BigInt64Array", a browser too old to run the site at all (iOS 14 and
 * earlier), which no change of ours fixes; and "Event `Event` (type=error)
 * captured as promise rejection", a failed third-party script or image load
 * with no message and no stack (39 of them by 2026-11-20, none actionable).
 */
const INJECTED_MESSAGES = [/_META\.IABInnerFrame/, /window\.webkit\.messageHandlers/];
const INJECTED_FUNCTIONS = new Set(['dispatchToBridge', 'sendDataToNative']);
const STALE_ACTION = /Server Action "[^"]*" was not found on the server|Failed to find Server Action/;
const UNACTIONABLE = [/Can't find variable: BigInt64Array/, /^Event: Event `Event` \(type=error\) captured as promise rejection/, /Event `Event` \(type=error\) captured as promise rejection/];

export function isNoise(event: ErrorEvent): boolean {
  const values = event.exception?.values ?? [];
  const messages = [event.message ?? '', ...values.map((v) => `${v.type ?? ''}: ${v.value ?? ''}`)];
  if (messages.some((m) => STALE_ACTION.test(m))) return true;
  if (messages.some((m) => UNACTIONABLE.some((re) => re.test(m)))) return true;

  const frames = values.flatMap((v) => v.stacktrace?.frames ?? []);
  const touchesOurBundle = frames.some((f) => /\/_next\//.test(f.filename ?? f.abs_path ?? ''));
  if (touchesOurBundle) return false;

  return (
    messages.some((m) => INJECTED_MESSAGES.some((re) => re.test(m))) ||
    frames.some((f) => INJECTED_FUNCTIONS.has(f.function ?? ''))
  );
}
