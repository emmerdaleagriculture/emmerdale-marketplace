import * as Sentry from '@sentry/nextjs';
import {
  DATA_COLLECTION,
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  SENTRY_RELEASE,
  TRACES_SAMPLE_RATE,
  warnIfDsnMissing,
} from '@/lib/sentry/options';
import { scrubEvent } from '@/lib/sentry/scrub';

/**
 * The edge runtime here is middleware.ts, which runs on every request that
 * is not a static asset and refreshes the Supabase session — so it sees every
 * authenticated request in the app, and an error in it breaks all of them at
 * once. It was previously the least observable part of the stack.
 */
warnIfDsnMissing('edge');

Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  release: SENTRY_RELEASE,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  dataCollection: DATA_COLLECTION,
  enableLogs: false,
  beforeSend: scrubEvent,
});
