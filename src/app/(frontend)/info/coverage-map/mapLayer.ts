import type * as Leaflet from 'leaflet';
import { TILE, tilePixels, type CoverageGrid } from '@/lib/info/coverage';

/**
 * Leaflet plumbing for the coverage map: the satellite base, and the painted
 * coverage drawn as one small canvas per grid tile. Each canvas is laid on
 * the map with L.svgOverlay, which places any element across a lat/lng box
 * and follows pans and zooms; only tiles the machine has just painted are
 * redrawn.
 */

export const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '').trim();

/**
 * A satellite map in `el`. `alive` is asked once Leaflet has loaded and
 * before the map is made: in development React mounts effects twice, and a
 * second Leaflet map on the same element throws, so the first must not be made.
 * Returns 'gone' when `alive` said no, null when Leaflet would not load.
 */
export async function makeMap(
  el: HTMLElement,
  view: { lat: number; lng: number; zoom: number },
  onTilesFail: () => void,
  alive: () => boolean,
): Promise<{ L: typeof Leaflet; map: Leaflet.Map } | null | 'gone'> {
  let L: typeof Leaflet;
  try {
    L = (await import('leaflet')).default as unknown as typeof Leaflet;
    await import('leaflet/dist/leaflet.css');
  } catch (err) {
    console.error('[coverageMap] leaflet failed to load:', err);
    return null;
  }
  if (!alive()) return 'gone';
  const map = L.map(el, { zoomControl: true }).setView([view.lat, view.lng], view.zoom);
  const tiles = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`, {
    attribution: '© Mapbox © OpenStreetMap © Maxar',
    tileSize: 512,
    zoomOffset: -1,
    maxZoom: 21,
    maxNativeZoom: 20,
  });
  let sawTile = false;
  tiles.on('load', () => (sawTile = true));
  tiles.on('tileerror', () => {
    if (!sawTile) onTilesFail();
  });
  tiles.addTo(map);
  return { L, map };
}

export type CoverageLayer = {
  /** Redraw what the grid has painted since the last call. */
  sync: (grid: CoverageGrid) => void;
  clear: () => void;
};

export function coverageLayer(L: typeof Leaflet, map: Leaflet.Map, className: string): CoverageLayer {
  const drawn = new Map<
    string,
    {
      ctx: CanvasRenderingContext2D;
      img: ImageData;
      overlay: Leaflet.SVGOverlay;
    }
  >();
  // Its own pane under the overlay pane, so the machine and its width are
  // always drawn on top of the ground already covered.
  if (!map.getPane('coverage')) map.createPane('coverage').style.zIndex = '350';
  return {
    sync(grid) {
      for (const t of grid.takeDirty()) {
        const key = `${t.tx},${t.ty}`;
        let d = drawn.get(key);
        if (!d) {
          const canvas = document.createElement('canvas');
          canvas.width = TILE;
          canvas.height = TILE;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          const [[w, s], [e, n]] = grid.tileBounds(t);
          // svgOverlay takes any element; the types only say SVG.
          const overlay = L.svgOverlay(
            canvas as unknown as SVGElement,
            [
              [s, w],
              [n, e],
            ],
            { interactive: false, className, pane: 'coverage' },
          ).addTo(map);
          d = { ctx, img: ctx.createImageData(TILE, TILE), overlay };
          drawn.set(key, d);
        }
        tilePixels(t, d.img.data);
        d.ctx.putImageData(d.img, 0, 0);
      }
    },
    clear() {
      for (const d of drawn.values()) d.overlay.remove();
      drawn.clear();
    },
  };
}
