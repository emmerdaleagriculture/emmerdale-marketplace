import * as Sentry from '@sentry/nextjs';

/**
 * Server-side registration hook (Next.js runs this once per runtime, before
 * any request). Each runtime gets its own Sentry.init, so the import is
 * dynamic and conditional — loading the Node config inside the edge runtime
 * pulls in Node built-ins that do not exist there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * The line that does most of the work.
 *
 * Next.js hands every unhandled server-side request error to this hook, so
 * one export covers the two /start server actions, all 14 route handlers, the
 * Stripe webhook and the balances cron — without touching a single one of
 * them. Until now an exception in any of those left a console.error in
 * Vercel's runtime log, which is a live stream rather than a history and is
 * unreadable within the hour.
 */
export const onRequestError = Sentry.captureRequestError;
