import { NextResponse } from 'next/server';

/**
 * /.well-known/apple-app-site-association (rewritten here in next.config):
 * tells iOS which of this site's links open in the app (PRD task 10).
 * Served as JSON with no redirect, which Apple insists on — so the app's
 * Associated Domains entry must name www.emmerdaleagriculture.com, the host
 * that answers directly; the bare domain redirects to it.
 */
const TEAM_ID = (process.env.APPLE_TEAM_ID ?? 'G3UHKZ4LQ2').trim();
const BUNDLE_ID = (process.env.APPLE_BUNDLE_ID ?? 'com.emmerdaleagriculture.app').trim();

/** The pages a push, a text or a payment return can land on. */
const COMPONENTS = [
  { '/': '/app', comment: 'welcome and app screens' },
  { '/': '/app/*' },
  { '/': '/t/*', comment: 'short links in texts and pushes' },
  { '/': '/my/*', comment: "a customer's job pages" },
  { '/': '/quote/*', comment: "a contractor's price page" },
  { '/': '/messages*' },
  { '/': '/invitations*' },
  { '/': '/won*' },
  { '/': '/jobs*' },
  // The membership page sells through Stripe, which the app may not (it
  // redirects there to /app/earnings), so an email's "Join Open" link stays
  // in the browser. Apple takes the first matching rule: keep this above /account*.
  { '/': '/account/membership*', exclude: true, comment: 'buying stays in the browser' },
  { '/': '/account*' },
  { '/': '/start*', comment: 'the job flow' },
  { '/': '/login*' },
];

export function GET() {
  const body = {
    applinks: { details: [{ appIDs: [`${TEAM_ID}.${BUNDLE_ID}`], components: COMPONENTS }] },
    webcredentials: { apps: [`${TEAM_ID}.${BUNDLE_ID}`] },
  };
  return NextResponse.json(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}
