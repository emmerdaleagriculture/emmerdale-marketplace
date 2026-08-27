'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { BoundaryPolygon } from '@/lib/jobParse/geometry';
import s from './BoundaryPreview.module.css';

const PIN_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">' +
  '<path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 27 15 27s15-16 15-27C30 6.7 23.3 0 15 0z" fill="#e03131"/>' +
  '<circle cx="15" cy="15" r="6" fill="#fff"/></svg>';

function pinIcon(L: typeof Leaflet) {
  // Leaflet's default marker PNGs 404 under the bundler — inline SVG instead.
  return L.divIcon({
    html: PIN_ICON_SVG,
    className: '',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  });
}

const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '').trim();

/**
 * Read-only satellite view of a job's pin and drawn boundary (§26a.4 — lets
 * a contractor sanity-check the job in seconds). No drawing code; degrades to
 * nothing when the token is missing or tiles fail, exactly like BoundaryMap.
 */
export function BoundaryPreview({
  lat,
  lng,
  boundary,
}: {
  lat: number;
  lng: number;
  boundary: BoundaryPolygon | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

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

      map = L.map(containerRef.current, { zoomControl: true, dragging: true });
      const tiles = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
        { attribution: '© Mapbox © OpenStreetMap © Maxar', tileSize: 512, zoomOffset: -1, maxZoom: 20 },
      );
      let sawTile = false;
      tiles.on('load', () => { sawTile = true; });
      tiles.on('tileerror', () => { if (!sawTile && !cancelled) setFailed(true); });
      tiles.addTo(map);

      L.marker([lat, lng], { icon: pinIcon(L) }).addTo(map);
      if (boundary) {
        const ring = boundary.coordinates[0].map(
          ([plng, plat]) => [plat, plng] as [number, number],
        );
        const poly = L.polygon(ring, { color: '#ffde00', weight: 2, fillOpacity: 0.15 }).addTo(map);
        map.fitBounds(poly.getBounds().pad(0.25));
      } else {
        map.setView([lat, lng], 16);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
    // Static job data — initialise once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!MAPBOX_TOKEN || failed) return null;
  return <div ref={containerRef} className={s.map} />;
}
