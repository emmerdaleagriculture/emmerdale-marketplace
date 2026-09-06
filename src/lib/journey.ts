import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * How people behave on a tracked page, aggregated per visit.
 *
 * Everything in page_events is a fraction of the document or a milestone in
 * a flow, keyed by a per-tab session that means nothing outside the tab. This
 * turns those rows into the three things worth putting in front of an
 * operator: where the clicks land (for the overlay), how far down visits got,
 * and — on /start — how far through the two steps they got.
 */

export const MILESTONES: { key: string; label: string }[] = [
  { key: 'typed', label: 'Started typing' },
  { key: 'send', label: 'Pressed Send' },
  { key: 'parsed', label: 'Saw step 2' },
  { key: 'map_drawn', label: 'Drew the field' },
  { key: 'contact', label: 'Started contact details' },
  { key: 'sent', label: 'Sent the job' },
];
export const ERROR_MILESTONES: { key: string; label: string }[] = [
  { key: 'parse_error', label: 'Step 1 came back with an error' },
  { key: 'confirm_error', label: 'Step 2 came back with an error' },
];

/** The overlay draws on a desktop render; phone clicks land somewhere else. */
export const DESKTOP_MIN = 700;

export type Journey = {
  visits: number;
  phoneShare: number;
  clicks: number;
  desktopPoints: { x: number; y: number }[];
  phonePoints: { x: number; y: number }[];
  bands: { mark: number; reached: number }[];
  milestones: { key: string; label: string; visits: number; seconds: number | null; error: boolean }[];
};

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

export async function loadJourney(path: string, days = 30): Promise<Journey> {
  const admin = createServiceRoleClient();
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const [clicksQ, depthsQ, stepsQ] = await Promise.all([
    admin
      .from('page_events')
      .select('x_pct, y_pct, viewport_w')
      .eq('path', path).eq('kind', 'click').gte('created_at', since)
      .order('created_at', { ascending: false }).limit(3000),
    admin
      .from('page_events')
      .select('depth_pct, session_key, viewport_w')
      .eq('path', path).eq('kind', 'depth').gte('created_at', since)
      .order('created_at', { ascending: false }).limit(5000),
    admin
      .from('page_events')
      .select('label, session_key, seconds')
      .eq('path', path).eq('kind', 'step').gte('created_at', since)
      .order('created_at', { ascending: false }).limit(10000),
  ]);

  const clicks = (clicksQ.data ?? []).filter(
    (c): c is { x_pct: number; y_pct: number; viewport_w: number | null } =>
      c.x_pct !== null && c.y_pct !== null,
  );
  const depths = (depthsQ.data ?? []).filter((d) => d.depth_pct !== null);
  const steps = stepsQ.data ?? [];

  // A visit is a tab. /start flushes more than once per tab as the flow
  // moves, so count keys, not rows.
  const visitKeys = new Set<string>([
    ...depths.map((d) => d.session_key),
    ...steps.map((s) => s.session_key),
  ]);
  const visits = visitKeys.size;
  const phoneKeys = new Set(
    depths.filter((d) => (d.viewport_w ?? 0) > 0 && (d.viewport_w ?? 0) < DESKTOP_MIN).map((d) => d.session_key),
  );

  const milestone = (key: string, error: boolean, label: string) => {
    const rows = steps.filter((r) => r.label === key);
    return {
      key, label, error,
      visits: new Set(rows.map((r) => r.session_key)).size,
      seconds: median(rows.map((r) => r.seconds).filter((x): x is number => x !== null)),
    };
  };

  return {
    visits,
    phoneShare: visits > 0 ? phoneKeys.size / visits : 0,
    clicks: clicks.length,
    desktopPoints: clicks
      .filter((c) => (c.viewport_w ?? DESKTOP_MIN) >= DESKTOP_MIN)
      .map((c) => ({ x: c.x_pct, y: c.y_pct })),
    // A click with no recorded viewport is an old row; it is neither.
    phonePoints: clicks
      .filter((c) => (c.viewport_w ?? 0) > 0 && (c.viewport_w ?? 0) < DESKTOP_MIN)
      .map((c) => ({ x: c.x_pct, y: c.y_pct })),
    bands: [10, 25, 50, 75, 90, 100].map((mark) => ({
      mark,
      reached: new Set(depths.filter((d) => (d.depth_pct ?? 0) >= mark).map((d) => d.session_key)).size,
    })),
    milestones: [
      ...MILESTONES.map((m) => milestone(m.key, false, m.label)),
      ...ERROR_MILESTONES.map((m) => milestone(m.key, true, m.label)).filter((m) => m.visits > 0),
    ],
  };
}

export const fmtSeconds = (sec: number | null) =>
  sec === null ? '—' : sec < 90 ? `${sec}s` : `${Math.round(sec / 60)}m`;
