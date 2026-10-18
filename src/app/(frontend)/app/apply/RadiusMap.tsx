'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import s from './apply.module.css';

const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '').trim();

/**
 * The travel radius drawn on a map: the base as a pin, the radius as a
 * circle. Leaflet, loaded on demand as BoundaryPreview does; Mapbox tiles
 * when the token is set, OpenStreetMap otherwise.
 */
export function RadiusMap({ lat, lng, miles }: { lat: number; lng: number; miles: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const circleRef = useRef<Leaflet.Circle | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !ref.current) return;
        if (!mapRef.current) {
          const map = L.map(ref.current, { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false });
          const tiles = MAPBOX_TOKEN
            ? L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`, { tileSize: 512, zoomOffset: -1, attribution: '© Mapbox © OpenStreetMap' })
            : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' });
          tiles.addTo(map);
          L.circleMarker([lat, lng], { radius: 6, color: '#17330d', fillColor: '#ffde00', fillOpacity: 1 }).addTo(map);
          mapRef.current = map;
        }
        const map = mapRef.current;
        circleRef.current?.remove();
        circleRef.current = L.circle([lat, lng], { radius: miles * 1609.34, color: '#367c2b', fillColor: '#367c2b', fillOpacity: 0.15, weight: 1.5 }).addTo(map);
        map.fitBounds(circleRef.current.getBounds(), { padding: [12, 12] });
      } catch (err) {
        console.error('[apply] map failed:', err);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, miles]);

  if (failed) return null;
  return <div ref={ref} className={s.map} aria-hidden="true" />;
}
