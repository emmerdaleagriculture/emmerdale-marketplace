import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEADLINE, KICKER, PROMISES, STANDFIRST, TICKER } from './proposition';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
/** Source without comments — history notes may name retired claims; rendered copy may not. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Claims deliberately taken off the site; neither surface may bring them back. */
const RETIRED = [/prices upfront/i, /pass it to contractors/i, /hold your money/i];

describe('customer proposition', () => {
  const all = [KICKER, HEADLINE, STANDFIRST.before, STANDFIRST.emphasis, STANDFIRST.after, ...TICKER, ...PROMISES.flat()];

  it('carries none of the retired claims', () => {
    for (const line of all) for (const re of RETIRED) expect(line).not.toMatch(re);
  });

  it('is rendered by both the homepage and the app entry screen', () => {
    for (const page of ['src/app/(frontend)/page.tsx', 'src/app/(frontend)/app/page.tsx']) {
      const src = code(read(page));
      expect(src).toContain("from '@/lib/home/proposition'");
      expect(src).toContain('{HEADLINE}');
      expect(src).toContain('STANDFIRST.emphasis');
      for (const re of RETIRED) expect(src).not.toMatch(re);
    }
  });
});
