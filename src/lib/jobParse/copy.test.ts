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
// Whole words only. The bidding vocabulary — quote, proposal, estimate — is
// what §10 is guarding against: the landing record is a job specification, not
// a request for offers. "Price" is deliberately NOT here: it is the platform's
// own word everywhere the customer meets money (§19: "language says price,
// never quote"), and the step-1 bullets promise "several prices to choose
// from" because that is the product. Banning it made the test fight the copy
// the site is built around.
const BANNED = /\b(quotes?|proposals?|estimates?)\b/i;

// The constraint is on what the customer reads. A code comment that mentions
// the contractor's quote page is not customer-facing, and failing on it only
// teaches people to phrase comments around the test.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('spec §10 language constraints', () => {
  it('no banned vocabulary in the landing flow source', () => {
    for (const file of readdirSync(START_DIR)) {
      if (!/\.(tsx?|css)$/.test(file)) continue;
      const source = readFileSync(path.join(START_DIR, file), 'utf8');
      const hits = stripComments(source).match(BANNED);
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
