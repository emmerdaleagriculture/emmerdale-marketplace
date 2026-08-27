import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANONICAL_SERVICES, LLM_SERVICE_VALUES, RECORD_JOB_PARSE_TOOL } from './schema';

/**
 * Guard rails that would otherwise only fail in production:
 *  - spec §10: no customer-facing copy on the landing flow may use quote /
 *    proposal / estimate / price language — this record is a job
 *    specification, not an offer.
 *  - the Zod enum and the strict tool JSON schema must agree exactly, or the
 *    model can emit values the validator rejects (or vice versa).
 */

const START_DIR = path.resolve(import.meta.dirname, '../../app/(frontend)/start');
// Whole words only: "area-priced" (an internal term) is not the word "price".
const BANNED = /\b(quotes?|proposals?|estimates?|prices?)\b/i;

describe('spec §10 language constraints', () => {
  it('no banned vocabulary in the landing flow source', () => {
    for (const file of readdirSync(START_DIR)) {
      if (!/\.(tsx?|css)$/.test(file)) continue;
      const source = readFileSync(path.join(START_DIR, file), 'utf8');
      const hits = source.match(BANNED);
      expect(hits, `${file} contains banned word "${hits?.[0]}"`).toBeNull();
    }
  });
});

describe('taxonomy schema consistency', () => {
  it('tool schema service enum matches LLM_SERVICE_VALUES', () => {
    expect(RECORD_JOB_PARSE_TOOL.input_schema.properties.service.enum).toEqual([
      ...LLM_SERVICE_VALUES,
    ]);
  });

  it('tool schema alternatives enum matches CANONICAL_SERVICES', () => {
    expect(RECORD_JOB_PARSE_TOOL.input_schema.properties.service_alternatives.items.enum).toEqual([
      ...CANONICAL_SERVICES,
    ]);
  });

  it('unmatched is in the service enum but never in alternatives', () => {
    expect([...LLM_SERVICE_VALUES]).toContain('unmatched');
    expect([...CANONICAL_SERVICES]).not.toContain('unmatched');
  });
});
