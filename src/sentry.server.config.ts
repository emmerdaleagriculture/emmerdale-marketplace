import * as Sentry from '@sentry/nextjs';
import {
  DATA_COLLECTION,
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  SENTRY_RELEASE,
  TRACES_SAMPLE_RATE,
} from '@/lib/sentry/options';
import { scrubEvent } from '@/lib/sentry/scrub';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  release: SENTRY_RELEASE,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  dataCollection: DATA_COLLECTION,

  // Sentry's Next.js guide recommends turning this on, and on most servers it
  // is the single most useful debugging option there is. Not on this one: the
  // locals in the frames that matter are the customer's details themselves —
  // `d.contact_email` and `d.contact_name` are locals inside confirmJobAction,
  // `values.raw_text` inside parseJobAction — so attaching local variables
  // would hand Sentry precisely what every other setting here withholds.
  includeLocalVariables: false,

  // Off deliberately. `enableLogs` forwards console output, and the 80-odd
  // console.error calls in this codebase print database errors that quote the
  // offending row. Errors and tracing are the baseline; logs can be turned on
  // once those call sites are known not to echo customer data.
  enableLogs: false,

  beforeSend: scrubEvent,
});
