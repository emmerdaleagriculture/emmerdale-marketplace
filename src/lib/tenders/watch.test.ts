import { describe, expect, it } from 'vitest';
import { contractKey, scoreRelevance } from './match';
import { dedupe, toCandidate, transition, type Candidate } from './watch';
import type { RawNotice } from './sources';

const now = new Date('2026-11-12T06:00:00Z');
const notice = (over: Partial<RawNotice> = {}): RawNotice => ({
  source: 'contracts_finder',
  noticeId: 'n1',
  stage: 'open',
  title: 'Grass cutting and verge maintenance 2027-30',
  buyer: 'Stockbridge Parish Council',
  description: '',
  url: 'https://example.test/n1',
  publishedAt: '2026-11-01T00:00:00Z',
  deadline: '2026-12-01T12:00:00Z',
  contractStart: null,
  contractEnd: null,
  valueLow: null,
  valueHigh: 30000,
  supplier: null,
  postcode: 'SO20 6HF',
  lat: null,
  lng: null,
  cpvCodes: [],
  ...over,
});

describe('scoreRelevance', () => {
  it('keeps a title hit and tags the family', () => {
    const r = scoreRelevance('Hedge cutting contract', '', []);
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.fit).toBe('rural');
  });
  it('sinks negative titles', () => {
    expect(scoreRelevance('Playground equipment and grass cutting', '', []).score).toBeLessThan(3);
    expect(scoreRelevance('Castle Farm Countryside Classroom (4 seats)', '', []).score).toBeLessThan(3);
  });
  it('matches whole words only', () => {
    expect(scoreRelevance('Streetscene vehicle lease', '', []).matched).not.toContain('tree');
  });
});

describe('toCandidate', () => {
  it('drops open notices past their deadline', () => {
    expect(toCandidate(notice({ deadline: '2026-11-01T00:00:00Z' }), now)).toBeNull();
  });
  it('turns a running award into a renewal four months before the end', () => {
    const c = toCandidate(notice({ stage: 'award', contractEnd: '2027-03-31T00:00:00Z', supplier: 'Acme' }), now)!;
    expect(c.kind).toBe('renewal');
    expect(c.actionBy?.slice(0, 10)).toBe('2026-11-30');
  });
  it('drops finished contracts', () => {
    expect(toCandidate(notice({ stage: 'award', contractEnd: '2025-03-31T00:00:00Z' }), now)).toBeNull();
  });
});

describe('dedupe + transition', () => {
  it('one key per contract across tender and award notices', () => {
    expect(contractKey('X Council', 'Grounds maintenance - AWARD')).toBe(contractKey('X Council', 'Grounds maintenance'));
  });
  it('prefers the live notice and keeps the incumbent', () => {
    const open = toCandidate(notice(), now)!;
    const award = toCandidate(notice({ noticeId: 'n0', stage: 'award', contractEnd: '2027-03-31T00:00:00Z', supplier: 'Acme', publishedAt: '2023-04-01T00:00:00Z' }), now)!;
    const [only] = dedupe([award, open]);
    expect(only!.kind).toBe('open');
    expect(only!.incumbent).toBe('Acme');
  });
  it('renewal → open stamps live_since; stale notices are ignored', () => {
    const c = toCandidate(notice(), now) as Candidate;
    const up = transition({ kind: 'renewal', published_at: '2023-04-01T00:00:00Z' }, c, now.toISOString())!;
    expect(up.kind).toBe('open');
    expect(up.live_since).toBe(now.toISOString());
    expect(transition({ kind: 'open', published_at: '2026-11-05T00:00:00Z' }, c, now.toISOString())).toBeNull();
  });
});
