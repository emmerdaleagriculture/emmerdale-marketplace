/**
 * Counts clicks that do nothing.
 *
 * Signs in, opens a list page, clicks a link on it, and waits for the address
 * to change. Then does it again, a hundred or so times. A click whose page
 * never arrives is a "dead" click: the fault that webpack/reactRenderPhasePing.cjs
 * corrects. Without the fix, between 32 and 50 dead in 120 on a production
 * build and 7 in 60 on the live site; with it, 0 in 120 on both (2026-11-26
 * and 27).
 *
 * WHAT IT TOUCHES. It only follows links, and with the settings left alone
 * (the admin, from the jobs list to a job page) opening those pages records
 * nothing, so that run is safe against the live site. No other run is safe
 * without thought, because a visit can itself be an event: a contractor
 * opening /quote/... stamps the invitation as opened and starts its reply
 * clock, a customer opening /my/... marks the prices as seen, the Books home
 * page syncs the ledger. A local build is no different: .env.local points it
 * at the same database as the live site. So a run with EMAIL, START or LINKS
 * set has to be asked for with VISITS_OK=1, which is you saying that the
 * account is yours to use this way (the admin, the test contractor, never a
 * real contractor or customer) and that the pages it will open may be opened.
 *
 * The session is minted with the service-role key in .env.local: no email is
 * sent and no password is needed. An address with no account is refused, not
 * signed up.
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
 * For Books, as a contractor with Books. Leave out the "whose books"
 * switcher: its links come straight back to the page they are on.
 *   VISITS_OK=1 EMAIL=... START=/account/books \
 *     LINKS='a[href^="/account/books/"]:not([href*="/switch"])' node scripts/deadClickProbe.mjs
 *
 * It exits 0 with no dead clicks, 1 with any, 2 if too few clicks were made
 * to say (links hidden or covered, pages failing to load) and 3 if it could
 * not run at all (a setting, the sign-in, a crash). Needs Node 22 or later.
 */
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium } from 'playwright';

const DEFAULT_START = '/admin/submissions';
const DEFAULT_LINKS = 'a[class*=submissions_title]';

/** The probe could not do its job: that says nothing about the site either way. */
function stop(message) {
  console.error(`deadClickProbe: ${message}`);
  process.exit(3);
}

// Supabase keys and ADMIN_EMAILS, read into this object and nowhere else: put
// into process.env, every key in the file would be handed to the browsers
// launched below. Anything already set in the shell wins.
let env;
try {
  env = { ...parseEnv(readFileSync('.env.local', 'utf8')), ...process.env };
} catch (err) {
  stop(`could not read .env.local (run it from the project root): ${err.message}`);
}

/** A setting that has to be a whole number of at least 1: "4O" is not 40. */
function wholeNumber(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^[1-9]\d*$/.test(raw)) stop(`${name} has to be a whole number of at least 1, not "${raw}"`);
  return Number(raw);
}

const BASE = env.BASE || 'http://localhost:3107';
const EMAIL = env.EMAIL || (env.ADMIN_EMAILS || '').split(',')[0].trim();
const START = env.START || DEFAULT_START;
const LINKS = env.LINKS || DEFAULT_LINKS;
const CLICKS = wholeNumber('CLICKS', 40);
const BROWSERS = wholeNumber('BROWSERS', 3);
const DEAD_MS = wholeNumber('DEAD_MS', 6000);

if (!EMAIL) stop('no EMAIL given and no ADMIN_EMAILS in .env.local');
if (!URL.canParse(START, BASE)) stop(`BASE "${BASE}" and START "${START}" do not make an address`);
const startUrl = new URL(START, BASE);

if ((env.EMAIL || START !== DEFAULT_START || LINKS !== DEFAULT_LINKS) && env.VISITS_OK !== '1') {
  stop(
    'EMAIL, START or LINKS is set, and outside the admin jobs list opening a page can be recorded against the ' +
      'account: an invitation as opened, prices as seen. That is as true of localhost as of the live site, ' +
      'because both use the same database. Sign in only as an account that is yours to use this way, and say ' +
      'so with VISITS_OK=1. See "WHAT IT TOUCHES" at the top of this file.',
  );
}

/** The auth cookies of a fresh session for `email`, shaped for Playwright. */
async function sessionCookies(email) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  // A recovery link, not a magic link. Asked for a magic link to an address
  // with no account, Supabase creates the account, so a mistyped EMAIL would
  // sign a stranger up. A recovery link signs in the same way and is refused
  // for an address it does not know.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (linkError) throw new Error(`could not sign in as ${email}: ${linkError.message}`);
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'recovery',
  });
  if (verifyError) throw new Error(`could not sign in as ${email}: ${verifyError.message}`);
  // Let @supabase/ssr write the cookies exactly as the site would.
  const jar = [];
  const ssr = createServerClient(url, anonKey, { cookies: { getAll: () => [], setAll: (c) => jar.push(...c) } });
  const { error: sessionError } = await ssr.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  if (sessionError) throw new Error(`could not sign in as ${email}: ${sessionError.message}`);
  if (jar.length === 0) throw new Error(`signed in as ${email}, but no session cookies were written`);
  return jar.map((c) => ({
    name: c.name,
    value: c.value,
    domain: startUrl.hostname,
    path: '/',
    secure: startUrl.protocol === 'https:',
  }));
}

// Third-party trackers only add noise to the timings. Matched on the host
// alone, so a page of ours with "facebook" in its address still loads. (With
// any route set, the browser's HTTP cache is off: every load fetches
// everything, which is slower than a returning visitor and the same each run.)
const TRACKERS = /^https?:\/\/[^/?#]*(?:google|doubleclick|facebook|clarity)/;

async function clickThrough(cookies, offset) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(cookies);
    await context.route(TRACKERS, (r) => r.abort());
    const page = await context.newPage();
    const result = { listPath: '', arrived: [], dead: [], failed: 0, skipped: 0 };

    await page.goto(startUrl.href, { waitUntil: 'networkidle' });
    // Where the list really is. START may redirect (/admin goes on to
    // /admin/submissions), and a click has only arrived once it has left the
    // page the browser was on, not the page that was asked for.
    const listPath = new URL(page.url()).pathname;
    result.listPath = listPath;
    const hrefs = await page.evaluate((selector) => {
      const links = [...document.querySelectorAll(selector)]
        // Links that open a page in this tab: not downloads, not new tabs.
        .filter((a) => !a.hasAttribute('download') && (!a.target || a.target === '_self'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => {
          if (!h) return false;
          const to = new URL(h, location.href);
          return to.origin === location.origin && to.pathname !== location.pathname;
        });
      return [...new Set(links)];
    }, LINKS);
    if (hrefs.length === 0) {
      const led = listPath === startUrl.pathname ? '' : ` (where ${START} led)`;
      throw new Error(`no links matching ${LINKS} on ${listPath}${led}: signed in as the right account?`);
    }

    for (let i = 0; i < CLICKS; i++) {
      const href = hrefs[(offset * 7 + 5 + i * 3) % hrefs.length];
      let clickedAt;
      try {
        // A fresh copy of the list each time, left to settle, so every click
        // starts from the same quiet page.
        await page.goto(startUrl.href, { waitUntil: 'networkidle' });
        if (new URL(page.url()).pathname !== listPath) throw new Error('not on the list');
        const link = page.locator(`a[href=${JSON.stringify(href)}]`).first();
        await link.scrollIntoViewIfNeeded({ timeout: 3000 });
        await page.waitForTimeout(1200);
        clickedAt = Date.now();
        // The click is over when the mouse is up. Where it leads is measured
        // below, not waited for here.
        await link.click({ timeout: 3000, noWaitAfter: true });
      } catch {
        // The list did not load, or the link was hidden or covered: not a
        // click, so it says nothing either way. Counted, and reported.
        result.skipped++;
        continue;
      }
      try {
        // Anywhere but the list counts as arriving (a page that redirects on
        // still answered the click), and it counts from the moment the
        // address changes: how long the new page takes to finish loading is
        // a different question.
        await page.waitForURL((u) => u.pathname !== listPath, { timeout: DEAD_MS, waitUntil: 'commit' });
        result.arrived.push(Date.now() - clickedAt);
      } catch (err) {
        // Dead is a click that led nowhere in the time allowed. A navigation
        // that failed outright is some other fault, reported apart.
        if (err?.name === 'TimeoutError') result.dead.push(href);
        else result.failed++;
      }
    }
    return result;
  } finally {
    await browser.close();
  }
}

let results;
try {
  const cookies = await sessionCookies(EMAIL);
  results = await Promise.all(Array.from({ length: BROWSERS }, (_, i) => clickThrough(cookies, i)));
} catch (err) {
  // The first line is the fault; Playwright's call log follows it.
  stop((err instanceof Error ? err.message : String(err)).split('\n')[0]);
}

const arrived = results.flatMap((r) => r.arrived).sort((a, b) => a - b);
const dead = results.flatMap((r) => r.dead);
const failed = results.reduce((n, r) => n + r.failed, 0);
const skipped = results.reduce((n, r) => n + r.skipped, 0);
const clicks = arrived.length + dead.length;
const { listPath } = results[0];

console.log(`${new URL(listPath, BASE).href}: ${dead.length} dead of ${clicks} clicks`);
if (listPath !== startUrl.pathname) console.log(`(${START} led to ${listPath})`);
if (arrived.length) console.log(`live clicks: median ${arrived[arrived.length >> 1]} ms, slowest ${arrived.at(-1)} ms`);
// Enough of them to go and look at; the count above is the result.
const deadPages = [...new Set(dead)];
for (const href of deadPages.slice(0, 10)) console.log(`  dead: ${href}`);
if (deadPages.length > 10) console.log(`  and ${deadPages.length - 10} more pages`);
if (failed) console.log(`${failed} clicks led to a page that failed to load: not counted either way`);
if (skipped) console.log(`${skipped} attempts never became a click (list failed to load, or link hidden or covered)`);

// "0 dead" from a handful of clicks is not a pass.
const tooFew = clicks < (CLICKS * BROWSERS) / 2;
if (tooFew) console.log(`Too few clicks to mean anything: ${clicks} of ${CLICKS * BROWSERS} attempted.`);
process.exit(dead.length ? 1 : tooFew ? 2 : 0);
