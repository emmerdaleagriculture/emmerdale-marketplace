import { describe, expect, it } from 'vitest';
import { callParseModel } from './llm';

/**
 * Live verification against the real Anthropic API: strict tool use + forced
 * tool_choice + temperature 0 on claude-haiku-4-5, and the spec §12
 * classification examples. Costs real (tiny) money and needs
 * ANTHROPIC_API_KEY, so it only runs when explicitly requested:
 *
 *   LIVE_PARSE_TEST=1 npx vitest run src/lib/jobParse/live.test.ts
 *
 * Re-run after any change to the prompt or tool schema. Note: the first call
 * after a schema change pays a one-off grammar-compile penalty and may hit
 * the 8s cap once; verified 2026-08-27 at 2.2–3.4s per call thereafter.
 */
const NOW = new Date('2026-08-27T12:00:00Z');

describe.skipIf(!process.env.LIVE_PARSE_TEST)('live claude-haiku-4-5 strict tool verification', () => {
  it('spec §12 example 1: explicit acreage + trade term', async () => {
    const r = await callParseModel(
      "I need my 7 acre field topped, it's just off the A31 near Alresford",
      'SO24 9AA',
      NOW,
    );
    console.log(JSON.stringify(r, null, 2));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parse.service).toBe('Paddock topping');
      expect(r.parse.service_verbatim.toLowerCase()).toContain('topped');
    }
  }, 15000);

  it('spec §12 example 2: no taxonomy vocabulary at all', async () => {
    const r = await callParseModel(
      "the paddock's got away from me, needs cutting back",
      '',
      NOW,
    );
    console.log(JSON.stringify(r, null, 2));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parse.service).toBe('Paddock topping');
    }
  }, 15000);

  it('nonsense input prefers unmatched over a poor fit', async () => {
    const r = await callParseModel(
      'I need someone to repair the slate roof on my barn before winter',
      'SO24',
      NOW,
    );
    console.log(JSON.stringify(r, null, 2));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parse.service).toBe('unmatched');
    }
  }, 15000);
});
