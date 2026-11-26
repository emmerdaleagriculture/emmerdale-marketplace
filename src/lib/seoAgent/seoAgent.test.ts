import { describe, expect, it } from 'vitest';
import { groupByQuery, isBrandQuery, triageRow } from './triage';
import { normalisePath, parsePageContext } from './pageContext';
import { trimMeta, trimTitle, validateArticle, validateOnPage } from './generate';
import { verdictFor } from './outcomes';
import { findCollision } from './collision';
import { holdsQuery, COOLDOWN_DAYS } from './persist';

const O = 'https://www.emmerdaleagriculture.com';
const row = (query: string, page: string, impressions: number, position: number, clicks = 0) => ({
  keys: [query, `${O}${page}`],
  impressions,
  position,
  clicks,
  ctr: impressions ? clicks / impressions : 0,
});

describe('groupByQuery', () => {
  it('keeps the page with the most impressions, not the best position', () => {
    const [g] = groupByQuery([row('rotavating', '/services/rotavating', 11, 7.2), row('rotavating', '/notes/rotavating', 251, 7.8)]);
    expect(g.page).toBe(`${O}/notes/rotavating`);
    expect(g.impressions).toBe(251);
  });
  it('flags a second page with a real share as a split, and ignores a trickle', () => {
    const [g] = groupByQuery([
      row('paddock topping', '/services/paddock-topping', 100, 9),
      row('paddock topping', '/notes/paddock-topping-cost', 40, 12),
      row('paddock topping', '/', 8, 30),
    ]);
    expect(g.otherPages?.map((p) => p.page)).toEqual([`${O}/notes/paddock-topping-cost`]);
  });
});

describe('triageRow', () => {
  const r = (position: number, impressions = 50, ctr = 0) => ({ query: 'q', impressions, position, ctr, clicks: 0 });
  it('bands by position', () => {
    expect(triageRow(r(3))).toMatchObject({ candidate: true, type: 'meta_rewrite' });
    expect(triageRow(r(8))).toMatchObject({ candidate: true, type: 'on_page_tweak' });
    expect(triageRow(r(25))).toMatchObject({ candidate: true, type: 'new_article' });
  });
  it('leaves a healthy top-5 CTR and thin demand alone', () => {
    expect(triageRow(r(2, 50, 0.2)).candidate).toBe(false);
    expect(triageRow(r(8, 9)).candidate).toBe(false);
    expect(triageRow(r(8, 10)).candidate).toBe(true);
  });
  it('needs more impressions to call a CTR problem than a ranking one', () => {
    expect(triageRow(r(3, 15)).candidate).toBe(false);
    expect(triageRow(r(3, 25))).toMatchObject({ candidate: true, type: 'meta_rewrite' });
  });
});

it('treats the brand as navigational noise', () => {
  expect(isBrandQuery('emmerdale agriculture')).toBe(true);
  expect(isBrandQuery('Emmerdale Agriculture reviews')).toBe(true);
  expect(isBrandQuery('hedge cutting cost')).toBe(false);
});

describe('parsePageContext', () => {
  const html = `<html><head><title>Hedge cutting | Emmerdale Agriculture</title><meta name="description" content="Prices."></head><body>
    <header data-app-hide><a href="/pricing">Pricing</a></header>
    <nav id="site-menu" hidden><a href="/contact">Contact</a></nav>
    <h1>Hedge cutting with a tractor flail</h1>
    <p>For field boundaries. See <a href="https://www.emmerdaleagriculture.com/services/flailing/">flailing</a>.</p>
    <h2>When to cut</h2><p>After 31 August.</p>
    <h3>How much does it cost?</h3><p>It depends.</p>
    <details><summary>Do I need to be there?</summary><p>No.</p></details>
    <aside data-thumb><a href="/start">Contact us</a></aside>
    <footer data-app-hide><a href="/terms">Terms</a></footer>
  </body></html>`;
  const c = parsePageContext(`${O}/services/hedge-cutting`, html);
  it('reads title, meta, h1 and headings', () => {
    expect(c.title).toBe('Hedge cutting | Emmerdale Agriculture');
    expect(c.metaDescription).toBe('Prices.');
    expect(c.h1).toBe('Hedge cutting with a tractor flail');
    expect(c.headings).toEqual(['## When to cut', '### How much does it cost?']);
  });
  it('collects existing questions from headings and summaries', () => {
    expect(c.existingQuestions).toEqual(['How much does it cost?', 'Do I need to be there?']);
  });
  it('drops chrome links and normalises absolute ones', () => {
    expect(c.internalLinks).toEqual(['/services/flailing']);
  });
});

it('normalises paths', () => {
  expect(normalisePath('https://x.com/notes/a/?q=1#h')).toBe('/notes/a');
  expect(normalisePath('services/b')).toBe('/services/b');
  expect(normalisePath('/')).toBe('/');
});

describe('validators', () => {
  const page = { url: '', title: '', metaDescription: '', h1: '', headings: [], bodyText: '', existingQuestions: ['How much does it cost?'], internalLinks: ['/services/flailing'] };
  const siteMap = [{ path: '/services/flailing', title: 'F' }, { path: '/notes/hedge-cutting-cost', title: 'C' }, { path: '/start', title: 'S' }];
  it('drops repeated FAQs, links the page has, unknown paths and self-links', () => {
    const d = validateOnPage(
      {
        newH2: 'H',
        newH2Body: 'B',
        rationale: '',
        faqAdditions: [{ question: 'how much does it cost', answer: 'x' }, { question: 'When is it illegal?', answer: 'y' }],
        internalLinksToAdd: [
          { anchor: 'a', path: '/services/flailing', reason: '' },
          { anchor: 'b', path: '/notes/made-up', reason: '' },
          { anchor: 'c', path: '/notes/hedge-cutting-cost/', reason: '' },
          { anchor: 'd', path: '/services/hedge-cutting', reason: '' },
        ],
      },
      page,
      [...siteMap, { path: '/services/hedge-cutting', title: 'self' }],
      `${O}/services/hedge-cutting`,
    )!;
    expect(d.faqAdditions.map((f) => f.question)).toEqual(['When is it illegal?']);
    expect(d.internalLinksToAdd.map((l) => l.anchor)).toEqual(['c']);
  });
  it('strips the brand from titles and cuts at a word', () => {
    expect(trimTitle('Hedge Cutting Prices | Emmerdale Agriculture')).toBe('Hedge Cutting Prices');
    expect(trimTitle('a'.repeat(30) + ' ' + 'b'.repeat(30)).length).toBeLessThanOrEqual(50);
  });
  it('cuts metas at a sentence, never mid-word with an ellipsis', () => {
    const m = trimMeta('First sentence is here and it is long enough to keep. ' + 'More words '.repeat(20));
    expect(m.endsWith('.')).toBe(true);
    expect(m.length).toBeLessThanOrEqual(155);
  });
  it('cleans article slugs and drops a leading H1', () => {
    const d = validateArticle({ title: 'T', metaDescription: 'M.', slug: 'How Much Does Hedge Cutting Cost Per Metre In The UK In Twenty Twenty Six', bodyMarkdown: '# T\n\nBody' })!;
    expect(d.slug.length).toBeLessThanOrEqual(60);
    expect(d.slug.endsWith('-')).toBe(false);
    expect(d.bodyMarkdown).toBe('Body');
  });
});

describe('verdictFor', () => {
  it('leans on position, with clicks as a tie-breaker', () => {
    expect(verdictFor({ clicks: 0, position: 9.3 }, { clicks: 0, position: 5.5 })).toBe('improved');
    expect(verdictFor({ clicks: 0, position: 18 }, { clicks: 0, position: 24 })).toBe('worse');
    expect(verdictFor({ clicks: 1, position: 7 }, { clicks: 1, position: 6.3 })).toBe('flat');
    expect(verdictFor({ clicks: 2, position: 7 }, { clicks: 8, position: 7 })).toBe('improved');
    expect(verdictFor({ clicks: 2, position: 7 }, null)).toBe('gone');
  });
});

it('turns an article into a tweak when a page already covers it', () => {
  const docs = [{ path: '/notes/hedge-cutting-cost', title: 'How much does hedge cutting cost?', kind: 'note' as const }];
  expect(findCollision('hedge cutting cost', docs)?.path).toBe('/notes/hedge-cutting-cost');
  expect(findCollision('mole ploughing depth', docs)).toBeNull();
});

describe('holdsQuery (cooldown)', () => {
  const now = Date.parse('2026-12-01T07:00:00Z');
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
  it('holds open rows forever and decided rows for the cooldown', () => {
    expect(holdsQuery({ status: 'pending', created_at: daysAgo(400), decided_at: null }, now)).toBe(true);
    expect(holdsQuery({ status: 'completed', created_at: daysAgo(30), decided_at: daysAgo(20) }, now)).toBe(true);
    expect(holdsQuery({ status: 'rejected', created_at: daysAgo(COOLDOWN_DAYS + 1), decided_at: daysAgo(100) }, now)).toBe(false);
  });
  it('does not let auto-superseded rows renew their own suppression', () => {
    expect(holdsQuery({ status: 'superseded', created_at: daysAgo(10), decided_at: null }, now)).toBe(false);
    expect(holdsQuery({ status: 'superseded', created_at: daysAgo(10), decided_at: daysAgo(10) }, now)).toBe(true);
  });
});

describe('write an article on request', () => {
  const base = { type: 'new_article', status: 'superseded', related_note_id: null, review_notes: null };

  it('offers it for a deferred or failed article row', async () => {
    const { canWriteArticle } = await import('./writeArticle');
    expect(canWriteArticle({ ...base, review_notes: 'Deferred: over the per-run article cap. Not held back; raised again next run.' })).toBe(true);
    expect(canWriteArticle({ ...base, status: 'pending' })).toBe(true);
    expect(canWriteArticle({ ...base, status: 'approved' })).toBe(true);
  });

  it('never for a row that already has a note, a held-back row, a closed row or another type', async () => {
    const { canWriteArticle } = await import('./writeArticle');
    expect(canWriteArticle({ ...base, status: 'pending', related_note_id: 'n1' })).toBe(false);
    expect(canWriteArticle({ ...base, review_notes: 'Held back: #22 raised or resolved this query within the cooldown.' })).toBe(false);
    expect(canWriteArticle({ ...base, status: 'completed' })).toBe(false);
    expect(canWriteArticle({ ...base, status: 'rejected' })).toBe(false);
    expect(canWriteArticle({ ...base, type: 'on_page_tweak', status: 'pending' })).toBe(false);
  });
});
