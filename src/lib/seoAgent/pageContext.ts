/**
 * Page context: what the target page actually says, for grounding drafts.
 *
 * HPM's agent first drafted from the page TITLE alone, and the drafts
 * invented machinery and specs and re-proposed FAQs the page already had,
 * month after month (hpm-site PR #58). So every on-page and meta draft here is
 * given the LIVE page: what Google sees, and the same code path for service
 * pages (copy in src/lib/services/content), notes (markdown in the DB) and the
 * county pages. A failed fetch returns null; the caller then drafts from the
 * title only and logs it, rather than sinking the run.
 */

import * as cheerio from 'cheerio';

export type PageContext = {
  url: string;
  title: string;
  metaDescription: string;
  h1: string;
  /** Every h2/h3 in order, e.g. "## When to cut hedges". */
  headings: string[];
  /** Headings/summaries phrased as questions: the page's existing FAQ coverage. */
  existingQuestions: string[];
  /** Internal paths the page already links to, normalised (see normalisePath). */
  internalLinks: string[];
  /** Body text with headings inline, capped at MAX_BODY_CHARS. */
  bodyText: string;
};

const MAX_BODY_CHARS = 9000; // ~1,500 words
const FETCH_TIMEOUT_MS = 10_000;

export async function fetchPageContext(pageUrl: string): Promise<PageContext | null> {
  if (!/^https?:\/\//.test(pageUrl)) return null;
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'EmmerdaleSeoAgent/1.0 (+internal)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return parsePageContext(pageUrl, await res.text());
  } catch {
    return null;
  }
}

/** Normalise an internal href for comparison: no origin, query, hash or trailing slash. */
export function normalisePath(href: string): string {
  let p = href.trim();
  if (/^https?:\/\//.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      /* keep as-is */
    }
  }
  p = p.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Pure parser, exported for tests. */
export function parsePageContext(pageUrl: string, html: string): PageContext {
  const $ = cheerio.load(html);
  const title = clean($('head > title').first().text());
  const metaDescription = clean($('meta[name="description"]').attr('content') ?? '');

  // Site chrome repeats on every page and would drown the body. Everything
  // the app hides in app mode (data-app-hide) is chrome by definition:
  // header, footer, breadcrumb, the get-the-app card. <aside> here is the
  // contact button and app promo, never page content.
  $(
    'script, style, noscript, svg, header, nav, footer, aside, form, [data-app-hide], [aria-hidden="true"], [hidden]',
  ).remove();
  const root = $('body');

  const h1 = clean(root.find('h1').first().text());
  const headings: string[] = [];
  const existingQuestions: string[] = [];
  root.find('h2, h3').each((_, el) => {
    const text = clean($(el).text());
    if (!text) return;
    headings.push(`${el.tagName === 'h2' ? '##' : '###'} ${text}`);
    if (text.endsWith('?')) existingQuestions.push(text);
  });
  // FAQ accordions use <summary>/<dt> as often as headings.
  root.find('summary, dt').each((_, el) => {
    const text = clean($(el).text());
    if (text.endsWith('?') && !existingQuestions.includes(text)) existingQuestions.push(text);
  });

  let origin = '';
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    /* relative url */
  }
  const altOrigin = origin.replace('://www.', '://');
  const links = new Set<string>();
  root.find('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (href.startsWith('/') && !href.startsWith('//')) links.add(normalisePath(href));
    else if (origin && (href.startsWith(origin) || href.startsWith(altOrigin))) links.add(normalisePath(href));
  });

  const parts: string[] = [];
  root.find('h1, h2, h3, h4, p, li, td, dt, dd, summary, figcaption').each((_, el) => {
    // Skip elements inside a list item or cell: the container already emits them.
    if ($(el).parents('li, td, dd').length) return;
    const text = clean($(el).text());
    if (!text) return;
    if (/^h[1-4]$/.test(el.tagName)) parts.push(`\n${'#'.repeat(Number(el.tagName[1]))} ${text}`);
    else if (el.tagName === 'li') parts.push(`- ${text}`);
    else parts.push(text);
  });
  let bodyText = parts.join('\n').trim();
  if (bodyText.length > MAX_BODY_CHARS) {
    bodyText = bodyText.slice(0, MAX_BODY_CHARS).replace(/\s+\S*$/, '') + '\n[…page continues]';
  }

  return {
    url: pageUrl,
    title,
    metaDescription,
    h1,
    headings,
    existingQuestions,
    internalLinks: Array.from(links).sort(),
    bodyText,
  };
}

/** Render a context block for a prompt. The body is data, never instructions. */
export function formatPageContext(ctx: PageContext): string {
  return [
    `Current <title>: ${ctx.title || '(none)'}`,
    `Current meta description: ${ctx.metaDescription || '(none)'}`,
    `H1: ${ctx.h1 || '(none)'}`,
    `Existing headings:\n${ctx.headings.join('\n') || '(none)'}`,
    `Questions the page already answers:\n${ctx.existingQuestions.map((q) => `- ${q}`).join('\n') || '(none)'}`,
    `Internal links already on the page: ${ctx.internalLinks.join(', ') || '(none)'}`,
    `Page body:\n<page_body>\n${ctx.bodyText}\n</page_body>`,
  ].join('\n\n');
}
