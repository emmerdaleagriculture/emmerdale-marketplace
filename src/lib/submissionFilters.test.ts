import { describe, expect, it } from 'vitest';
import { isSubmissionFilter, matchesFilter, type FilterIds } from '@/lib/submissionFilters';

const now = Date.parse('2026-09-13T12:00:00Z');
const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();
const none: FilterIds = { priced: new Set(), paid: new Set() };

const row = (over: Partial<Parameters<typeof matchesFilter>[0]> = {}) => ({
  id: 'a',
  status: 'distributed',
  created_at: daysAgo(3),
  confirmed_at: daysAgo(3),
  distributed_at: daysAgo(3),
  ...over,
});

describe('matchesFilter', () => {
  it('counts drafts as started but not sent', () => {
    const draft = row({ status: 'draft', confirmed_at: null, distributed_at: null });
    expect(matchesFilter(draft, 'started', none, now)).toBe(true);
    expect(matchesFilter(draft, 'sent', none, now)).toBe(false);
  });

  it('keeps the funnel to the last 30 days', () => {
    const old = row({ created_at: daysAgo(40), confirmed_at: daysAgo(40) });
    expect(matchesFilter(old, 'started', none, now)).toBe(false);
    expect(matchesFilter(old, 'sent', none, now)).toBe(false);
  });

  it('only counts jobs that went out as reaching contractors', () => {
    expect(matchesFilter(row(), 'reached', none, now)).toBe(true);
    expect(matchesFilter(row({ status: 'no_matches' }), 'reached', none, now)).toBe(false);
    expect(matchesFilter(row({ status: 'confirmed' }), 'reached', none, now)).toBe(false);
  });

  it('uses the quote and payment ids for priced and paid', () => {
    const ids: FilterIds = { priced: new Set(['a']), paid: new Set() };
    expect(matchesFilter(row(), 'priced', ids, now)).toBe(true);
    expect(matchesFilter(row(), 'paid', ids, now)).toBe(false);
  });

  it('flags a job with no price only after 48 hours out', () => {
    expect(matchesFilter(row({ distributed_at: daysAgo(1) }), 'no_quotes_48h', none, now)).toBe(false);
    expect(matchesFilter(row(), 'no_quotes_48h', none, now)).toBe(true);
  });
});

describe('isSubmissionFilter', () => {
  it('accepts known filters only', () => {
    expect(isSubmissionFilter('priced')).toBe(true);
    expect(isSubmissionFilter('toString')).toBe(false);
    expect(isSubmissionFilter(undefined)).toBe(false);
  });
});
