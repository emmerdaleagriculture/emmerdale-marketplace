/**
 * Project ONS county/district outlines into src/lib/ukCountyPaths.ts space.
 *
 * The original generator for that file was never committed. This one drew the
 * Northern Ireland districts on 2026-10-10 using project() from
 * src/lib/radiusCoverage.ts — the same spherical-Mercator fit the land grid and
 * the point-in-county test use — so new outlines land on the same canvas as
 * the existing ones without touching them.
 *
 * Run:
 *   curl -s -o buc.geojson "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Counties_and_Unitary_Authorities_December_2023_Boundaries_UK_BUC/FeatureServer/0/query?where=CTYUA23CD%20like%20%27N%25%27&outFields=CTYUA23CD,CTYUA23NM&outSR=4326&f=geojson"
 *   npx tsx scripts/countyPathsFromOns.ts buc.geojson > paths.json
 *
 * Output is {name: "M…L…Z…"} keyed by the ONS name, which must match
 * counties.name exactly. Paste each entry into UK_COUNTY_PATHS and bump the
 * count in its header comment. Render the result before committing: a bad fit
 * shows up at once as an island floating in the wrong sea.
 */
import { readFileSync } from 'node:fs';
import { project } from '../src/lib/radiusCoverage';

type Ring = [number, number][];
type Geometry =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] };
type Feature = { properties: { CTYUA23NM: string }; geometry: Geometry };

const fmt = (v: number) => v.toFixed(1).replace(/\.0$/, '');

function pathFor(geometry: Geometry): string {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  let d = '';
  for (const poly of polys) {
    for (const ring of poly) {
      const pts = ring.map(([lng, lat]) => project(lat, lng));
      if (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      const seq: string[] = [];
      for (const [x, y] of pts) {
        const p = `${fmt(x)},${fmt(y)}`;
        if (seq[seq.length - 1] !== p) seq.push(p);
      }
      d += `M${seq.join('L')}Z`;
    }
  }
  return d;
}

const file = process.argv[2];
if (!file) {
  console.error('usage: npx tsx scripts/countyPathsFromOns.ts <ons-buc.geojson>');
  process.exit(1);
}
const features = (JSON.parse(readFileSync(file, 'utf8')) as { features: Feature[] }).features;
const out: Record<string, string> = {};
for (const f of [...features].sort((a, b) => a.properties.CTYUA23NM.localeCompare(b.properties.CTYUA23NM))) {
  out[f.properties.CTYUA23NM] = pathFor(f.geometry);
}
process.stdout.write(JSON.stringify(out, null, 1));
