import { UK_MAP_VIEWBOX } from '@/lib/ukCountyPaths';
import { coverageMapLabel, coverageShapes } from '@/lib/coverage';
import { getCountyCoverage } from '@/lib/reference';

/**
 * The public coverage choropleth as a standalone SVG asset.
 *
 * The path data is ~110KB. Inlined on the front page it lands in the payload
 * twice — once as markup, once in the RSC flight data — which roughly doubled
 * the landing page's transfer. As its own file it is fetched lazily, below the
 * fold, and cached at the CDN in its own right.
 *
 * Built as a string rather than rendered: `react-dom/server` is not importable
 * from a route handler, so the shapes come from the shared helper instead.
 */

// Hourly, matching the landing page that embeds it.
export const revalidate = 3600;

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET() {
  const coverage = await getCountyCoverage();
  const paths = coverageShapes(coverage)
    .map(
      (c) =>
        `<path d="${c.d}" fill="${c.fill}" stroke="#fff" stroke-width="1"><title>${esc(c.title)}</title></path>`,
    )
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${UK_MAP_VIEWBOX}" role="img"` +
    ` aria-label="${esc(coverageMapLabel(coverage))}">${paths}</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
