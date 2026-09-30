import { UK_COUNTY_PATHS, UK_MAP_VIEWBOX } from '@/lib/ukCountyPaths';
import { getOpenJobsByCounty } from '@/lib/openJobs';

/**
 * Great Britain with every county that has a job open right now picked out,
 * for the contractor landing page. A standalone asset for the same reason as
 * /coverage-map.svg: the path data is ~110KB and must not be inlined.
 */

// Matching the page that embeds it.
export const revalidate = 3600;

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Field greens, deepening with the number of jobs. */
function fill(n: number) {
  if (n >= 3) return '#245018';
  if (n === 2) return '#4f8638';
  if (n === 1) return '#86b267';
  return '#e9ebe4';
}

export async function GET() {
  const counties = await getOpenJobsByCounty();
  const counts = new Map(counties.map((c) => [c.county, c.jobs.length]));
  const total = counties.reduce((n, c) => n + c.jobs.length, 0);

  const paths = Object.entries(UK_COUNTY_PATHS)
    .map(([name, d]) => {
      const n = counts.get(name) ?? 0;
      const title = `${name} — ${n === 0 ? 'no open jobs' : `${n} open job${n === 1 ? '' : 's'}`}`;
      return `<path d="${d}" fill="${fill(n)}" stroke="#fff" stroke-width="1"><title>${esc(title)}</title></path>`;
    })
    .join('');

  const label = `Map of Great Britain: ${total} open jobs across ${counties.length} counties`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${UK_MAP_VIEWBOX}" role="img"` +
    ` aria-label="${esc(label)}">${paths}</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
