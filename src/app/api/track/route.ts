import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * POST /api/track — the landing-page beacon. Takes a small batch of clicks and
 * one scroll-depth mark per visit, sent with sendBeacon when the tab is hidden.
 *
 * Public and unauthenticated, so it is written to be dull: a hard cap on batch
 * size, every field clamped or dropped, and nothing stored that identifies a
 * person. A flood costs some rows that the daily prune clears; it cannot cost
 * anything else. Always answers 204 — a beacon has nobody to tell.
 */

const MAX_EVENTS = 40;
const PATHS = new Set(['/', '/start']);

type Incoming = {
  path?: unknown;
  session?: unknown;
  events?: unknown;
};

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
};

/** depth_pct, viewport_w and doc_h are int columns: a fraction from a
 *  hand-crafted POST would fail the whole batch on coercion. */
const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = num(v, lo, hi);
  return n === null ? null : Math.round(n);
};

export async function POST(request: Request) {
  let body: Incoming;
  try {
    body = (await request.json()) as Incoming;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const path = typeof body.path === 'string' ? body.path.slice(0, 120) : '';
  const session = typeof body.session === 'string' ? body.session.slice(0, 40) : '';
  if (!PATHS.has(path) || !session || !Array.isArray(body.events)) {
    return new NextResponse(null, { status: 204 });
  }

  const rows = (body.events as Record<string, unknown>[])
    .slice(0, MAX_EVENTS)
    .map((e) => {
      const kind = e.kind === 'click' || e.kind === 'depth' ? e.kind : null;
      if (!kind) return null;
      return {
        path,
        kind,
        session_key: session,
        x_pct: kind === 'click' ? num(e.x, 0, 1) : null,
        y_pct: kind === 'click' ? num(e.y, 0, 1) : null,
        depth_pct: kind === 'depth' ? int(e.depth, 0, 100) : null,
        viewport_w: int(e.vw, 0, 10000),
        doc_h: int(e.dh, 0, 200000),
        label: typeof e.label === 'string' ? e.label.slice(0, 80) : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return new NextResponse(null, { status: 204 });

  try {
    const { error } = await createServiceRoleClient().from('page_events').insert(rows);
    // supabase-js resolves with an error rather than throwing: without reading
    // it, an RLS change or schema drift would drop every beacon silently and
    // the admin pages would just say "nothing recorded yet".
    if (error) console.error('[track] insert failed:', error.message);
  } catch (err) {
    console.error('[track] insert threw:', err);
  }
  return new NextResponse(null, { status: 204 });
}
