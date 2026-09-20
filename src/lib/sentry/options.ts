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
 * destination address rather than a credential (SENTRY_AUTH_TOKEN, used only
 * at build time for source maps, is the secret). Written as a literal with an
 * env override, because a DSN that resolves to undefined in production makes
 * Sentry silently do nothing — the one failure this whole exercise exists to
 * stop. `.de.` is not a typo: the org is in Sentry's EU region.
 */
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  'https://6d552e8cd01ff31ac3d70f46075e5b07@o4512119101587456.ingest.de.sentry.io/4512119114694736';

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
