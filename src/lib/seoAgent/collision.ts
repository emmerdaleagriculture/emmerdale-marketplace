/**
 * Lexical collision check: would a new article compete with a page we
 * already have? Stopwords stripped, light stemming, Jaccard over tokens of
 * the query vs each page's title + path. A hit turns the new_article into an
 * on_page_tweak against the existing page. (HPM's v1; embeddings are v2.)
 */

import type { SiteDoc } from './persist';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'how', 'i', 'in', 'is', 'it',
  'of', 'on', 'or', 'the', 'to', 'was', 'were', 'will', 'with', 'what', 'why', 'when', 'where', 'who',
  'which', 'do', 'does', 'can', 'should', 'best', 'top', 'guide', 'your', 'you', 'my', 'me', 'near',
  'uk', 'notes', 'services', 'local', 'prices', 'price',
]);

function stem(t: string): string {
  if (t.length <= 4) return t;
  let s = t;
  if (s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.endsWith('es')) s = s.slice(0, -2);
  else if (s.endsWith('s')) s = s.slice(0, -1);
  else if (s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.endsWith('er')) s = s.slice(0, -2);
  return s.length >= 4 ? s : t;
}

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .split(/[\s/-]+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let overlap = 0;
  for (const x of A) if (B.has(x)) overlap++;
  const union = A.size + B.size - overlap;
  return union === 0 ? 0 : overlap / union;
}

export function findCollision(query: string, docs: SiteDoc[], threshold = 0.55): SiteDoc | null {
  const q = tokens(query);
  if (!q.length) return null;
  let best: { doc: SiteDoc; score: number } | null = null;
  for (const doc of docs) {
    if (doc.kind === 'hub') continue;
    const score = jaccard(q, [...tokens(doc.title), ...tokens(doc.path)]);
    if (score >= threshold && (!best || score > best.score)) best = { doc, score };
  }
  return best?.doc ?? null;
}
