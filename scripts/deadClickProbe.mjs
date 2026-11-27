/**
 * Counts clicks that do nothing.
 *
 * Signs in, opens a list page, clicks a link on it, and waits for the address
 * to change. Then does it again, a hundred or so times. A click whose page
 * never arrives is a "dead" click: the fault that webpack/reactRenderPhasePing.cjs
 * corrects (2026-11-26: 37 dead in 120 on a production build without it, 0 in
 * 120 with it; the live site showed 7 in 40 before the fix).
 *
 * It only ever follows links, so it is safe to point at the live site. The
 * session is minted with the service-role key in .env.local: no email is
 * sent and no password is needed.
 *
 * Run it after any Next upgrade, and whenever clicks are reported as needing
 * a second press while the server looks healthy. It has to be a production
 * build: `npm run dev` compiles as it goes and the timings mean nothing.
 *
 *   npm run build && npx next start -p 3107      (never while `npm run dev` is up)
 *   node scripts/deadClickProbe.mjs
 *
 * or against the live site:
 *
 *   BASE=https://www.emmerdaleagriculture.com node scripts/deadClickProbe.mjs
 *
 * Settings, all optional, all environment variables:
 *   BASE      where the site is                (http://localhost:3107)
 *   EMAIL     who to sign in as                (the first ADMIN_EMAILS entry)
 *   START     the page the links are on        (/admin/submissions)
 *   LINKS     CSS selector for links to click  (a[class*=submissions_title])
 *   CLICKS    clicks per browser               (40)
 *   BROWSERS  browsers clicking at once        (3)
 *   DEAD_MS   how long a click gets to arrive  (6000; a live one takes under a second)
 *
 * For Books, as a contractor with Books:
 *   EMAIL=... START=/account/books LINKS='a[href^="/account/books/"]' node scripts/deadClickProbe.mjs
 *
 * Exits 1 if any click was dead, 2 if too few clicks were made to say
 * (links hidden or covered, pages failing to load). Needs Node 22 or later.
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium } from 'playwright';

// Supabase keys and ADMIN_EMAILS. Anything already set in the shell wins.
process.loadEnvFile('.env.local');
const env = process.env;

const BASE = env.BASE || 'http://localhost:3107';
const EMAIL = env.EMAIL || (env.ADMIN_EMAILS || '').split(',')[0].trim();
const START = env.START || '/admin/submissions';
const LINKS = env.LINKS || 'a[class*=submissions_title]';
const CLICKS = Number(env.CLICKS || 40);
const BROWSERS = Number(env.BROWSERS || 3);
const DEAD_MS = Number(env.DEAD_MS || 6000);

if (!EMAIL) throw new Error('No EMAIL given and no ADMIN_EMAILS in .env.local');

/** The auth cookies of a fresh session for `email`, shaped for Playwright. */
async function sessionCookies(email) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError) throw linkError;
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError) throw verifyError;
  // Let @supabase/ssr write the cookies exactly as the site would.
  const jar = [];
  const ssr = createServerClient(url, anonKey, { cookies: { getAll: () => [], setAll: (c) => jar.push(...c) } });
  await ssr.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  const { hostname, protocol } = new URL(BASE);
  return jar.map((c) => ({ name: c.name, value: c.value, domain: hostname, path: '/', secure: protocol === 'https:' }));
}

async function clickThrough(cookies, offset) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookies);
  // Third-party trackers only add noise to the timings.
  await context.route(/google|doubleclick|facebook|clarity/, (r) => r.abort());
  const page = await context.newPage();
  const result = { clicks: 0, skipped: 0, dead: [], times: [] };
  const startPath = new URL(START, BASE).pathname;

  await page.goto(BASE + START, { waitUntil: 'networkidle' });
  const hrefs = await page.evaluate(
    (selector) =>
      [...new Set([...document.querySelectorAll(selector)].map((a) => a.getAttribute('href')))].filter(
        (h) => h && new URL(h, location.href).origin === location.origin && new URL(h, location.href).pathname !== location.pathname,
      ),
    LINKS,
  );
  if (hrefs.length === 0) throw new Error(`No links matching ${LINKS} on ${START} (signed in as the right account?)`);

  for (let i = 0; i < CLICKS; i++) {
    const href = hrefs[(offset * 7 + 5 + i * 3) % hrefs.length];
    let clickedAt;
    try {
      // A fresh copy of the list each time, left to settle, so every click
      // starts from the same quiet page.
      await page.goto(BASE + START, { waitUntil: 'networkidle' });
      const link = page.locator(`a[href=${JSON.stringify(href)}]`).first();
      await link.scrollIntoViewIfNeeded({ timeout: 3000 });
      await page.waitForTimeout(1200);
      clickedAt = Date.now();
      await link.click({ timeout: 3000 });
    } catch {
      // The list did not load, or the link was hidden or covered: not a
      // click, so it says nothing either way. Counted, and reported.
      result.skipped++;
      continue;
    }
    result.clicks++;
    try {
      // Anywhere but the list counts as arriving: a page that redirects on
      // still answered the click.
      await page.waitForURL((u) => u.pathname !== startPath, { timeout: DEAD_MS });
      result.times.push(Date.now() - clickedAt);
    } catch {
      result.dead.push(href);
    }
  }
  await browser.close();
  return result;
}

const cookies = await sessionCookies(EMAIL);
const results = await Promise.all(Array.from({ length: BROWSERS }, (_, i) => clickThrough(cookies, i)));
const clicks = results.reduce((n, r) => n + r.clicks, 0);
const skipped = results.reduce((n, r) => n + r.skipped, 0);
const dead = results.flatMap((r) => r.dead);
const times = results.flatMap((r) => r.times).sort((a, b) => a - b);

console.log(`${BASE}${START}: ${dead.length} dead of ${clicks} clicks`);
if (times.length) {
  console.log(`live clicks: median ${times[times.length >> 1]} ms, slowest ${times[times.length - 1]} ms`);
}
for (const href of new Set(dead)) console.log(`  dead: ${href}`);
if (skipped) console.log(`${skipped} attempts never became a click (list failed to load, or link hidden or covered)`);

// "0 dead" from a handful of clicks is not a pass.
const tooFew = clicks < (CLICKS * BROWSERS) / 2;
if (tooFew) console.log(`Too few clicks to mean anything: ${clicks} of ${CLICKS * BROWSERS} attempted.`);
process.exit(dead.length ? 1 : tooFew ? 2 : 0);
