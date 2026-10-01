import * as Sentry from '@sentry/nextjs';
import {
  DATA_COLLECTION,
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  SENTRY_RELEASE,
  warnIfDsnMissing,
} from '@/lib/sentry/options';
import { scrubEvent } from '@/lib/sentry/scrub';

/**
 * Browser runtime. (The older `sentry.client.config.ts` name is gone; Next.js
 * loads this file itself.)
 *
 * No session replay. Sentry recommends it for user-facing apps and it would
 * genuinely help here — the /start funnel is where people quietly give up —
 * but replay records the DOM of a form into which customers type their name,
 * email address and the location of their land. That is a decision to take on
 * its own terms, with masking configured deliberately, rather than something
 * to switch on in passing while wiring up error reporting.
 */
warnIfDsnMissing('browser');

Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  release: SENTRY_RELEASE,
  // Browser spans are not collected: see bundleSizeOptimizations in
  // next.config.mjs, which also drops the tracing code from the bundle.
  tracesSampleRate: 0,
  dataCollection: DATA_COLLECTION,
  enableLogs: false,
  beforeSend: scrubEvent,
});

/** App Router navigations, so a client error carries the route it happened on. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
