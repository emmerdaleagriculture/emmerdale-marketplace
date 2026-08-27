'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { ringAreaAcres, type BoundaryPolygon, type LngLat } from '@/lib/jobParse/geometry';
import f from '@/components/forms/forms.module.css';
import s from './start.module.css';

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

export type BoundaryState = {
  /** Pin coords — null until the customer actually drags the pin. An
      untouched pin is just the parse-time geocode and must never override a
      postcode corrected on the confirm step. */
  lat: number | null;
  lng: number | null;
  boundary: BoundaryPolygon | null;
  mappedAcres: number | null;
};

/**
 * Area verification (spec §7): a draggable pin from the geocode, and a
 * tap-to-draw field boundary on satellite imagery. Leaflet is imported
 * dynamically so none of it ships before the confirm step renders, and the
 * whole component degrades to nothing (never blocks) when the token is
 * missing or tiles fail — the §6.4 rule extends here.
 *
 * The drawn area shown live is informational; the server recomputes it from
 * the polygon before storing (never trust a client-computed number).
 */
export function BoundaryMap({
  lat,
  lng,
  onChange,
  onStatus,
}: {
  lat: number;
  lng: number;
  onChange: (state: BoundaryState) => void;
  onStatus: (status: 'ready' | 'unavailable') => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const stateRef = useRef<{ pin: [number, number]; pinMoved: boolean; points: LngLat[] }>({
    pin: [lat, lng],
    pinMoved: false,
    points: [],
  });
  const redrawRef = useRef<() => void>(() => {});
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const [acres, setAcres] = useState<number | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [failed, setFailed] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      onStatusRef.current('unavailable');
      return;
    }
    let cancelled = false;
    let map: Leaflet.Map | null = null;

    (async () => {
      let L: typeof Leaflet;
      try {
        L = (await import('leaflet')).default as unknown as typeof Leaflet;
        await import('leaflet/dist/leaflet.css');
      } catch (err) {
        console.error('[boundaryMap] leaflet failed to load:', err);
        if (!cancelled) {
          setFailed(true);
          onStatusRef.current('unavailable');
        }
        return;
      }
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, { zoomControl: true }).setView([lat, lng], 17);
      mapRef.current = map;

      const tiles = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
        {
          attribution: '© Mapbox © OpenStreetMap © Maxar',
          tileSize: 512,
          zoomOffset: -1,
          maxZoom: 20,
        },
      );
      let sawTile = false;
      tiles.on('load', () => {
        sawTile = true;
      });
      tiles.on('tileerror', () => {
        // A bad token / network failure must not gate submission.
        if (!sawTile && !cancelled) {
          setFailed(true);
          onStatusRef.current('unavailable');
        }
      });
      tiles.addTo(map);
      onStatusRef.current('ready');

      const pin = L.marker([lat, lng], { draggable: true, icon: pinIcon(L) }).addTo(map);
      pin.on('dragend', () => {
        const p = pin.getLatLng();
        stateRef.current.pin = [p.lat, p.lng];
        stateRef.current.pinMoved = true;
        emit();
      });

      let polygon: Leaflet.Polygon | null = null;
      let vertexMarkers: Leaflet.CircleMarker[] = [];

      const redraw = () => {
        const pts = stateRef.current.points;
        polygon?.remove();
        vertexMarkers.forEach((m) => m.remove());
        vertexMarkers = [];
        polygon =
          pts.length >= 2
            ? L.polygon(
                pts.map(([plng, plat]) => [plat, plng] as [number, number]),
                { color: '#ffde00', weight: 2, fillOpacity: 0.15 },
              ).addTo(map!)
            : null;
        for (const [plng, plat] of pts) {
          vertexMarkers.push(
            L.circleMarker([plat, plng], { radius: 5, color: '#ffde00', fillOpacity: 1 }).addTo(map!),
          );
        }
        setPointCount(pts.length);
        setAcres(pts.length >= 3 ? Number(ringAreaAcres(pts).toFixed(2)) : null);
        emit();
      };
      redrawRef.current = redraw;

      const emit = () => {
        const pts = stateRef.current.points;
        onChangeRef.current({
          lat: stateRef.current.pinMoved ? stateRef.current.pin[0] : null,
          lng: stateRef.current.pinMoved ? stateRef.current.pin[1] : null,
          boundary:
            pts.length >= 3 ? { type: 'Polygon', coordinates: [[...pts, pts[0]]] } : null,
          mappedAcres: pts.length >= 3 ? Number(ringAreaAcres(pts).toFixed(2)) : null,
        });
      };

      map.on('click', (e: Leaflet.LeafletMouseEvent) => {
        if (!drawingRef.current) return;
        stateRef.current.points = [...stateRef.current.points, [e.latlng.lng, e.latlng.lat]];
        redraw();
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // Initialise once for the parse's geocode; pin dragging handles refinement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!MAPBOX_TOKEN || failed) return null;

  return (
    // The cursor toggle lives on the wrapper: React must never rewrite the
    // map div's className, because Leaflet adds its own classes to that
    // element and React's reconciliation would wipe them.
    <div className={drawing ? `${s.mapBlock} ${s.mapDrawing}` : s.mapBlock}>
      <div ref={containerRef} className={s.map} />
      <div className={s.mapControls}>
        {!drawing ? (
          <button
            type="button"
            className={f.btnPrimary}
            onClick={() => {
              setDrawing(true);
              drawingRef.current = true;
            }}
          >
            Draw the field edge
          </button>
        ) : (
          <>
            <span className={s.mapHint}>
              {pointCount < 3
                ? 'Tap the corners of the area, one by one.'
                : acres !== null
                  ? `That measures about ${acres} acres.`
                  : ''}
            </span>
            <button
              type="button"
              className={f.btnGhost}
              onClick={() => {
                stateRef.current.points = stateRef.current.points.slice(0, -1);
                redrawRef.current();
              }}
              disabled={pointCount === 0}
            >
              Undo
            </button>
            <button
              type="button"
              className={f.btnGhost}
              onClick={() => {
                stateRef.current.points = [];
                redrawRef.current();
              }}
              disabled={pointCount === 0}
            >
              Clear
            </button>
          </>
        )}
      </div>
      <p className={f.hint}>
        Drag the pin to the exact spot, then trace round the area so contractors
        can see exactly what they&rsquo;re looking at.
      </p>
    </div>
  );
}
