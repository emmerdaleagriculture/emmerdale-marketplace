import { NextResponse } from 'next/server';
import { getJobsInProgress, MIN_JOBS } from '@/lib/home/jobsInProgress';

/**
 * GET /api/jobs/ticker — the header ticker's feed: the latest live jobs as
 * service and county, nothing finer.
 *
 * The same `jobs_in_progress` view the homepage strip reads, so what scrolls
 * past in the header is exactly what the strip shows and publishes nothing
 * the strip does not: a canonical service name (or none) and a county.
 *
 * Static with a short revalidation rather than a per-request read: the header
 * is on every page, and the view is a join across live jobs. One JSON on the
 * CDN for a minute is plenty for something that only has to look alive.
 *
 * Under MIN_JOBS it answers an empty list and the ticker renders nothing —
 * the same floor as the strip, for the same reason: a ticker with two jobs on
 * it advertises that almost nobody has been in touch.
 */
export const dynamic = 'force-static';
export const revalidate = 60;

export type TickerItem = {
  /** A canonical services.name, or null when nothing matched. */
  service: string | null;
  county: string;
};

export async function GET() {
  const rows = await getJobsInProgress();
  const items: TickerItem[] =
    rows.length < MIN_JOBS ? [] : rows.map((r) => ({ service: r.service, county: r.county }));
  return NextResponse.json({ items });
}
