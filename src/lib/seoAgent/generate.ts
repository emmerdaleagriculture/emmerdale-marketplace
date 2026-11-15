/**
 * Classification and draft generation, plus the validators that enforce what
 * the prompts ask for (a prompt rule the model breaks once is a rule the
 * code should check).
 */

import { classifyJson, draftJson, type SpendBudget } from './llm';
import { formatPageContext, normalisePath, type PageContext } from './pageContext';
import {
  ARTICLE_SYSTEM,
  ArticleDraftSchema,
  CLASSIFY_SYSTEM,
  ClassificationSchema,
  META_SYSTEM,
  MetaDraftSchema,
  ONPAGE_SYSTEM,
  OnPageDraftSchema,
} from './prompts';
import type { Classification, MetaRewriteDraft, NewArticleDraft, OnPageTweakDraft, QueryRow } from './types';

export type SitePage = { path: string; title: string };

function siteMapLine(siteMap: SitePage[]): string {
  return `Site map (paths you may link to):\n${siteMap.map((p) => `${p.path} — ${p.title}`).join('\n')}`;
}

export async function classify(row: QueryRow, budget: SpendBudget): Promise<Classification | null> {
  return classifyJson({
    system: CLASSIFY_SYSTEM,
    user: [
      `Query: ${row.query}`,
      `Page Google shows: ${row.page ?? 'none'}`,
      `Average position: ${row.position.toFixed(1)}; impressions (28 days): ${row.impressions}; clicks: ${row.clicks}`,
    ].join('\n'),
    schema: ClassificationSchema,
    budget,
  });
}

export async function draftMetaRewrite(
  args: { row: QueryRow; related: string[]; expectedCtr: number; page: PageContext | null },
  budget: SpendBudget,
): Promise<MetaRewriteDraft | null> {
  const d = await draftJson({
    system: META_SYSTEM,
    user: [
      `Target query: ${args.row.query}`,
      ...(args.related.length ? [`Other queries this page is served for: ${args.related.join('; ')}`] : []),
      `Page: ${args.row.page}`,
      `Position ${args.row.position.toFixed(1)}; CTR ${(args.row.ctr * 100).toFixed(2)}% (about ${(args.expectedCtr * 100).toFixed(0)}% is typical at this position)`,
      args.page ? formatPageContext(args.page) : 'The page could not be fetched: keep claims generic.',
    ].join('\n\n'),
    schema: MetaDraftSchema,
    budget,
  });
  return d ? validateMeta(d) : null;
}

export async function draftOnPageTweak(
  args: { row: QueryRow; related: string[]; competing: string[]; page: PageContext | null; siteMap: SitePage[] },
  budget: SpendBudget,
): Promise<OnPageTweakDraft | null> {
  const d = await draftJson({
    system: ONPAGE_SYSTEM,
    user: [
      `Target query: ${args.row.query}`,
      ...(args.related.length ? [`Other queries this page is served for: ${args.related.join('; ')}`] : []),
      ...(args.competing.length ? [`Other URLs on this site Google also shows for the target query: ${args.competing.join('; ')}`] : []),
      `Page: ${args.row.page}`,
      `Position ${args.row.position.toFixed(1)}`,
      args.page
        ? formatPageContext(args.page)
        : 'The page could not be fetched, so you have no body: keep suggestions generic and claim no specifics.',
      siteMapLine(args.siteMap),
    ].join('\n\n'),
    schema: OnPageDraftSchema,
    budget,
  });
  return d ? validateOnPage(d, args.page, args.siteMap, args.row.page ?? '/') : null;
}

export async function draftArticle(
  args: { row: QueryRow; intent: string; rationale: string; existingNotes: string[]; siteMap: SitePage[] },
  budget: SpendBudget,
): Promise<NewArticleDraft | null> {
  const d = await draftJson({
    system: ARTICLE_SYSTEM,
    user: [
      `Target query: ${args.row.query}`,
      `Search intent: ${args.intent}`,
      `Why it was picked: ${args.rationale}`,
      `Existing articles (don't duplicate): ${args.existingNotes.join('; ') || 'none'}`,
      siteMapLine(args.siteMap),
    ].join('\n\n'),
    schema: ArticleDraftSchema,
    budget,
  });
  return d ? validateArticle(d) : null;
}

// --- validators ------------------------------------------------------

/** Cut to a sentence (or word) boundary rather than mid-word + "…". */
export function trimMeta(s: string, max = 155): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentence = cut.match(/^.*[.!?](?=\s|$)/s);
  if (sentence && sentence[0].length >= max * 0.6) return sentence[0].trim();
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > max * 0.5 ? cut.slice(0, lastSpace).replace(/[,;:\-–]\s*$/, '').trim() + '.' : cut.trim();
}

export function trimTitle(s: string, max = 50): string {
  const t = s.replace(/\s*[|–-]\s*Emmerdale Agriculture\s*$/i, '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\-–&]\s*$/, '').trim();
}

export function validateMeta(d: MetaRewriteDraft): MetaRewriteDraft | null {
  const alternatives = d.alternatives
    .filter((a) => a.title && a.meta)
    .map((a) => ({ title: trimTitle(a.title), meta: trimMeta(a.meta), rationale: a.rationale ?? '' }));
  return alternatives.length ? { alternatives } : null;
}

/**
 * Drop FAQs the page already answers and links it already has or that aren't
 * real site paths. Links compare by FULL path: leaf-only comparison treated
 * /notes/hedge-cutting-cost and /services/hedge-cutting as related (HPM review).
 */
export function validateOnPage(
  d: OnPageTweakDraft,
  page: PageContext | null,
  siteMap: SitePage[],
  pageUrl: string,
): OnPageTweakDraft | null {
  if (!d.newH2 || !d.newH2Body) return null;
  const known = new Map(siteMap.map((p) => [normalisePath(p.path), p.path]));
  const self = normalisePath(pageUrl);
  const linked = new Set(page?.internalLinks ?? []);
  const internalLinksToAdd = d.internalLinksToAdd.filter((l) => {
    const p = normalisePath(l.path);
    return known.has(p) && p !== self && !linked.has(p);
  });
  const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const asked = new Set((page?.existingQuestions ?? []).map(norm));
  const faqAdditions = d.faqAdditions.filter((f) => f.question && !asked.has(norm(f.question)));
  return { ...d, internalLinksToAdd, faqAdditions };
}

export function validateArticle(d: NewArticleDraft): NewArticleDraft | null {
  if (!d.title || !d.bodyMarkdown) return null;
  let slug = (d.slug || d.title)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Over the limit: cut back to the last whole word, never mid-word.
  if (slug.length > 60) {
    const cut = slug.slice(0, 61);
    slug = cut.slice(0, cut.lastIndexOf('-') > 0 ? cut.lastIndexOf('-') : 60);
  }
  if (!slug) return null;
  return {
    title: d.title.trim(),
    metaDescription: trimMeta(d.metaDescription ?? ''),
    slug,
    // A leading "# Title" duplicates the page H1 the notes template renders.
    bodyMarkdown: d.bodyMarkdown.replace(/^\s*#\s[^\n]*\n+/, '').trim(),
  };
}
