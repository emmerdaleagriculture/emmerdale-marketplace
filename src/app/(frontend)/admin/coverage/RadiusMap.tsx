'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { RadiusCoverage } from '@/lib/radiusCoverage';
import c from './coverage.module.css';

const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '').trim();
const METRES_PER_MILE = 1609.344;
/** Great Britain, Scilly to Shetland — the opening view. */
const GB_BOUNDS: [[number, number], [number, number]] = [
  [49.8, -8.3],
  [60.9, 1.9],
];

export type MapContractor = {
  id: string;
  name: string;
  postcode: string;
  lat: number;
  lng: number;
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Every approved contractor's base with a circle of the chosen radius round
 * it. Circles are translucent, so where several overlap the green deepens and
 * where there is none the basemap shows through — the gaps are the point.
 * Drawn on canvas: over a hundred circles as SVG make panning sluggish.
 */
export function RadiusMap({
  contractors,
  radii,
  initialRadius,
  coverage,
}: {
  contractors: MapContractor[];
  radii: number[];
  initialRadius: number;
  coverage: RadiusCoverage[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<{ L: typeof Leaflet; circles: Leaflet.LayerGroup } | null>(null);
  const [radius, setRadius] = useState(initialRadius);
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  const [failed, setFailed] = useState(false);

  const drawCircles = () => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.circles.clearLayers();
    for (const ct of contractors) {
      layers.L.circle([ct.lat, ct.lng], {
        radius: radiusRef.current * METRES_PER_MILE,
        stroke: false,
        fillColor: '#367c2b',
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(layers.circles);
    }
  };

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    let cancelled = false;
    let map: Leaflet.Map | null = null;

    (async () => {
      let L: typeof Leaflet;
      try {
        L = (await import('leaflet')).default as unknown as typeof Leaflet;
        await import('leaflet/dist/leaflet.css');
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled || !containerRef.current) return;

      // Fractional zoom: at whole steps Great Britain either overflows the box
      // or sits small in a sea of Scandinavia.
      map = L.map(containerRef.current, { preferCanvas: true, zoomSnap: 0.25 });
      const tiles = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
        { attribution: '© Mapbox © OpenStreetMap', tileSize: 512, zoomOffset: -1, maxZoom: 18 },
      );
      let sawTile = false;
      tiles.on('load', () => {
        sawTile = true;
      });
      tiles.on('tileerror', () => {
        if (!sawTile && !cancelled) setFailed(true);
      });
      tiles.addTo(map);
      // Leaflet reads the box size when it is created, which can be before the
      // page has laid it out — re-measure, then fit, or the fit uses a stale
      // (smaller) box and opens zoomed out.
      map.invalidateSize();
      map.fitBounds(GB_BOUNDS);
      const settled = map;
      requestAnimationFrame(() => {
        if (cancelled) return;
        settled.invalidateSize();
        settled.fitBounds(GB_BOUNDS);
      });

      const circles = L.layerGroup().addTo(map);
      const pins = L.layerGroup().addTo(map);
      for (const ct of contractors) {
        L.circleMarker([ct.lat, ct.lng], {
          radius: 4,
          color: '#fff',
          weight: 1,
          fillColor: '#17330d',
          fillOpacity: 1,
        })
          .bindTooltip(`${escapeHtml(ct.name)} · ${escapeHtml(ct.postcode)}`)
          .bindPopup(
            `<strong>${escapeHtml(ct.name)}</strong><br>${escapeHtml(ct.postcode)}<br>` +
              `<a href="/admin/contractors/${encodeURIComponent(ct.id)}">Open contractor</a>`,
          )
          .addTo(pins);
      }
      layersRef.current = { L, circles };
      drawCircles();
    })();

    return () => {
      cancelled = true;
      layersRef.current = null;
      map?.remove();
    };
    // Contractors are server data for this page view — initialise once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    drawCircles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius]);

  const figure = coverage.find((f) => f.radius === radius);

  return (
    <div>
      <div className={c.bar}>
        <div className={c.radii} role="group" aria-label="Radius">
          {radii.map((r) => (
            <button
              key={r}
              type="button"
              className={r === radius ? `${c.radius} ${c.radiusOn}` : c.radius}
              aria-pressed={r === radius}
              onClick={() => setRadius(r)}
            >
              {r} miles
            </button>
          ))}
        </div>
        {figure && (
          <span className={c.stat}>
            <strong>{figure.overall}%</strong> of Great Britain is within {radius} miles of a
            contractor
            {figure.byCountry.map((b) => ` · ${b.country} ${b.pct}%`).join('')}
          </span>
        )}
      </div>

      {!MAPBOX_TOKEN || failed ? (
        <div className={c.unavailable}>
          The map couldn&rsquo;t load (no Mapbox token, or the tiles failed).
        </div>
      ) : (
        <div ref={containerRef} className={c.map} />
      )}
      <p className={c.note}>
        Each circle is centred on a contractor&rsquo;s base postcode. Darker green means
        several contractors overlap; blank map means nobody is based within {radius} miles.
      </p>
    </div>
  );
}
