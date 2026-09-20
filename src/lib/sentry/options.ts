import type { init } from '@sentry/nextjs';

/** Not re-exported by name, so taken from the shape `init` accepts. */
type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>['dataCollection']>;

/**
 * The settings all three runtimes share, in one place so browser, Node and
 * edge cannot drift apart — particularly on the privacy options, where a
 * disagreement means one runtime quietly sending what the other two strip.
 */

/**
 * Public by design: the DSN ships inside the client bundle, so it is a
 * destination address rather than a credential. It permits posting events to
 * one project and nothing else — reading issues or changing anything needs
 * SENTRY_AUTH_TOKEN, which is a real secret and build-time only. Hence
 * NEXT_PUBLIC_, and hence `--type config` in Vercel: named without the prefix
 * it would be unreadable from the browser, and client-side error capture
 * would stop dead while the server carried on looking healthy.
 *
 * Set on production and preview. The env var is the only source — there is
 * no literal fallback, so the guard below carries the weight instead.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * An unset DSN does not throw: Sentry.init accepts it and quietly captures
 * nothing, which on a deployed site is indistinguishable from an app that
 * simply has no errors. That silence is the exact failure this whole setup
 * exists to prevent, so say so — loudly, in the build and function logs,
 * where a deploy that lost the variable is visible rather than assumed.
 *
 * Locally an unset DSN is ordinary and expected; nothing is said there.
 */
export function warnIfDsnMissing(runtime: string): void {
  const deployed = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);
  if (!SENTRY_DSN && deployed) {
    console.error(
      `[sentry] NEXT_PUBLIC_SENTRY_DSN is not set — the ${runtime} runtime is reporting NOTHING. ` +
        'Set it on this environment in Vercel (--type config) and redeploy.',
    );
  }
}

/** Keeps a preview deploy's errors out of the production issue stream. */
export const SENTRY_ENVIRONMENT =
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV ||
  'development';

/** Ties an issue to the commit that caused it, instead of "unknown release". */
export const SENTRY_RELEASE =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA;

/** Everything in development, a tenth of it in production. */
export const TRACES_SAMPLE_RATE = process.env.NODE_ENV === 'development' ? 1.0 : 0.1;

/**
 * Turn off every category of automatic data collection.
 *
 * This object is load-bearing and must not be trimmed to `{}`. Per Sentry's
 * own configuration reference: "When omitted, the SDK falls back to
 * sendDefaultPii (default false). Passing the object — even {} — flips unset
 * categories to their permissive defaults; opt out per category." So an empty
 * object is more permissive than no object at all, which is the shape the
 * setup wizard writes with the opt-outs left commented out.
 *
 * Everything here is a category this app would otherwise leak: `httpBodies`
 * is the /start server action payload, `queryParams` and `cookies` carry job
 * tokens and the Supabase session.
 */
export const DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  // An empty array disables body collection; omitting the key collects all
  // four directions.
  httpBodies: [],
  // `queryParams` is the deprecated spelling of this option.
  urlQueryParams: false,
};
