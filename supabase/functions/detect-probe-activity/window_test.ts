import { assert, assertEquals } from 'jsr:@std/assert@1';
import { computeWindow, parseBackfill } from './window.ts';

const now = new Date('2026-10-24T15:00:00Z');
const iso = (d: Date) => d.toISOString();

Deno.test('normal: the last 30 minutes, no state at all', () => {
  const w = computeWindow(now, null);
  assertEquals(iso(w.start), '2026-10-24T14:30:00.000Z');
  assertEquals(iso(w.end), '2026-10-24T15:00:00.000Z');
  assertEquals(w.catchingUp, false);
  assertEquals(w.unscored, null);
});

Deno.test('normal: the last firing succeeded 15 minutes ago (the usual overlap)', () => {
  const w = computeWindow(now, { last_success_end: '2026-10-24T14:45:00Z' });
  assertEquals(iso(w.start), '2026-10-24T14:30:00.000Z');
  assertEquals(w.catchingUp, false);
});

Deno.test('cron drift of under a minute is not a gap', () => {
  const w = computeWindow(now, { last_success_end: '2026-10-24T14:44:20Z' });
  assertEquals(iso(w.start), '2026-10-24T14:30:00.000Z');
  assertEquals(w.catchingUp, false);
});

Deno.test('after missed firings the window reaches back to 15 min before the last success', () => {
  const w = computeWindow(now, { last_success_end: '2026-10-24T13:30:00Z' });
  assertEquals(iso(w.start), '2026-10-24T13:15:00.000Z');
  assertEquals(w.catchingUp, true);
  assertEquals(w.unscored, null);
});

Deno.test('a catch-up reaches back at most 6 h; the rest is reported, not healed', () => {
  const w = computeWindow(now, { last_success_end: '2026-10-24T03:00:00Z' });
  assertEquals(iso(w.start), '2026-10-24T09:00:00.000Z');
  assertEquals(w.catchingUp, true);
  assert(w.unscored);
  assertEquals(iso(w.unscored.start), '2026-10-24T03:00:00.000Z');
  assertEquals(iso(w.unscored.end), '2026-10-24T09:00:00.000Z');
});

Deno.test('three failed catch-ups: give up, scan normally, report the span', () => {
  const w = computeWindow(now, { last_success_end: '2026-10-24T13:30:00Z', catchup_failures: 3 });
  assertEquals(iso(w.start), '2026-10-24T14:30:00.000Z');
  assertEquals(w.catchingUp, false);
  assert(w.unscored);
  assertEquals(iso(w.unscored.start), '2026-10-24T13:30:00.000Z');
  assertEquals(iso(w.unscored.end), '2026-10-24T14:30:00.000Z');
});

Deno.test('a garbage heartbeat value falls back to the normal window', () => {
  const w = computeWindow(now, { last_success_end: 'not a date' });
  assertEquals(iso(w.start), '2026-10-24T14:30:00.000Z');
});

Deno.test('backfill: both bounds, at most a day, or a plain error', () => {
  assertEquals(parseBackfill({}), null);
  assertEquals(parseBackfill(null), null);
  const ok = parseBackfill({ window_start: '2026-10-20T00:00:00Z', window_end: '2026-10-21T00:00:00Z' });
  assert(ok && 'start' in ok);
  const tooWide = parseBackfill({ window_start: '2026-10-20T00:00:00Z', window_end: '2026-10-21T00:00:01Z' });
  assert(tooWide && 'error' in tooWide);
  const backwards = parseBackfill({ window_start: '2026-10-21T00:00:00Z', window_end: '2026-10-20T00:00:00Z' });
  assert(backwards && 'error' in backwards);
  const junk = parseBackfill({ window_start: 'x', window_end: 'y' });
  assert(junk && 'error' in junk);
});
