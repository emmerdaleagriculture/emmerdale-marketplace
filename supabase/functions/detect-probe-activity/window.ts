// Which span of the gateway log a firing scans.
//
// Pure, so it can be tested against the clock it is given. The detector fires
// every 15 minutes and normally reads the last 30, so every request is seen
// twice and one missed firing costs nothing. After a run of failures the next
// good firing reaches back to where the last success ended, scores the gap
// itself and says so; what it cannot reach is reported as unscored, so a gap
// is never silently "healed" by a query that did not read it.

export const NORMAL_WINDOW_MS = 30 * 60_000;
/** The firings overlap by this much, so a catch-up starts a little before the last success. */
export const OVERLAP_MS = 15 * 60_000;
/**
 * A catch-up reaches back at most this far in one query: the Analytics
 * endpoint returns short results on wide windows and the query is capped at
 * 500 actors, so a wider window would heal a gap it never read.
 */
export const MAX_CATCHUP_MS = 6 * 60 * 60_000;
/** After this many failed catch-ups the span is abandoned and reported instead. */
export const MAX_CATCHUP_FAILURES = 3;
/** Cron drift. A lag under this is not a gap. */
const DRIFT_MS = 60_000;

export type DetectorState = {
  last_success_end?: string | null;
  catchup_failures?: number | null;
};

export type Window = {
  start: Date;
  end: Date;
  /** The window reaches further back than normal to cover missed firings. */
  catchingUp: boolean;
  /** A span this firing could not cover and that needs a manual backfill. */
  unscored: { start: Date; end: Date } | null;
};

export function computeWindow(now: Date, state: DetectorState | null | undefined): Window {
  const end = now;
  const normalStart = new Date(now.getTime() - NORMAL_WINDOW_MS);
  const lastEnd = state?.last_success_end ? new Date(state.last_success_end) : null;
  if (!lastEnd || Number.isNaN(lastEnd.getTime())) {
    return { start: normalStart, end, catchingUp: false, unscored: null };
  }

  // Where a catch-up would need to start to leave nothing between the last
  // scored window and this one.
  const wanted = new Date(lastEnd.getTime() - OVERLAP_MS);
  if (wanted.getTime() >= normalStart.getTime() - DRIFT_MS) {
    return { start: normalStart, end, catchingUp: false, unscored: null };
  }

  // Three failed catch-ups: stop trying, scan the normal window, and report
  // the span between the last success and this window as unscored, so a wide
  // query that itself times out cannot wedge the detector.
  if ((state?.catchup_failures ?? 0) >= MAX_CATCHUP_FAILURES) {
    return {
      start: normalStart,
      end,
      catchingUp: false,
      unscored: { start: lastEnd, end: normalStart },
    };
  }

  const floor = new Date(now.getTime() - MAX_CATCHUP_MS);
  if (wanted.getTime() < floor.getTime()) {
    // Further back than one query can read: scan what it can, report the rest.
    return {
      start: floor,
      end,
      catchingUp: true,
      unscored: { start: lastEnd, end: floor },
    };
  }
  return { start: wanted, end, catchingUp: true, unscored: null };
}

/** A manual backfill window: both bounds given, at most a day apart. */
export const MAX_BACKFILL_MS = 24 * 60 * 60_000;

export function parseBackfill(body: unknown): { start: Date; end: Date } | { error: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.window_start == null && b.window_end == null) return null;
  const start = new Date(String(b.window_start));
  const end = new Date(String(b.window_end));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'window_start and window_end must both be ISO timestamps' };
  }
  if (end.getTime() <= start.getTime()) return { error: 'window_end must be after window_start' };
  if (end.getTime() - start.getTime() > MAX_BACKFILL_MS) {
    return { error: 'a backfill window is at most 24 hours' };
  }
  return { start, end };
}
