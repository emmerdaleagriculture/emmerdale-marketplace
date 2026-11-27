'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type * as Leaflet from 'leaflet';
import { acresParam, keepWalkPoint, measureArea, pathLengthM, type LngLat } from '@/lib/info/areaMaths';
import { fig } from '@/lib/info/sprayMaths';
import { onePosition, watchPosition, type Fix } from '@/lib/info/position';
import css from './area.module.css';

/**
 * Measure a field on satellite imagery: tap its corners, or walk its edge
 * with the phone's GPS, and read the area and the length round it. Or
 * measure an open line (a hedge, a fence run) instead.
 *
 * Everything is worked in the browser; nothing is sent or stored except the
 * last map view, kept on the device so the map opens where it was left.
 */

const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '').trim();
const VIEW_KEY = 'ea_info_area_view';
const UK: { lat: number; lng: number; zoom: number } = { lat: 54.4, lng: -2.6, zoom: 6 };

type Mode = 'area' | 'length';

const metres = (m: number) => (m >= 1000 ? `${fig(m / 1000)} km` : `${Math.round(m).toLocaleString('en-GB')} m`);

function savedView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom)) return v as typeof UK;
  } catch {}
  return null;
}

export function AreaMapper() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const pointsRef = useRef<LngLat[]>([]);
  const modeRef = useRef<Mode>('area');
  const redrawRef = useRef<() => void>(() => {});
  const youRef = useRef<Leaflet.CircleMarker | null>(null);
  const stopWalkRef = useRef<(() => void) | null>(null);
  const movedRef = useRef(false);

  const [points, setPoints] = useState<LngLat[]>([]);
  const [mode, setModeState] = useState<Mode>('area');
  const [failed, setFailed] = useState(!MAPBOX_TOKEN);
  const [place, setPlace] = useState('');
  const [finding, setFinding] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [walkFix, setWalkFix] = useState<number | null>(null);

  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
    redrawRef.current();
  };

  const setAll = (pts: LngLat[]) => {
    pointsRef.current = pts;
    redrawRef.current();
  };

  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    let cancelled = false;
    // The opening position fix, stopped if the page is left before it lands.
    const locating = new AbortController();
    let map: Leaflet.Map | null = null;

    (async () => {
      let L: typeof Leaflet;
      try {
        L = (await import('leaflet')).default as unknown as typeof Leaflet;
        await import('leaflet/dist/leaflet.css');
      } catch (err) {
        console.error('[areaMap] leaflet failed to load:', err);
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled || !containerRef.current) return;
      LRef.current = L;

      const start = savedView() ?? UK;
      map = L.map(containerRef.current, { zoomControl: true }).setView([start.lat, start.lng], start.zoom);
      mapRef.current = map;

      const tiles = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
        { attribution: '© Mapbox © OpenStreetMap © Maxar', tileSize: 512, zoomOffset: -1, maxZoom: 20 },
      );
      let sawTile = false;
      tiles.on('load', () => (sawTile = true));
      tiles.on('tileerror', () => {
        if (!sawTile && !cancelled) setFailed(true);
      });
      tiles.addTo(map);

      map.on('moveend', () => {
        const c = map!.getCenter();
        try {
          localStorage.setItem(VIEW_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map!.getZoom() }));
        } catch {}
      });

      let shape: Leaflet.Polygon | Leaflet.Polyline | null = null;
      let corners: Leaflet.Marker[] = [];
      let lastDragEndAt = 0;
      const latlngs = () => pointsRef.current.map(([lng, lat]) => [lat, lng] as [number, number]);
      const icon = L.divIcon({ className: css.corner, iconSize: [26, 26], iconAnchor: [13, 13] });

      const redraw = () => {
        shape?.remove();
        corners.forEach((m) => m.remove());
        corners = [];
        const pts = pointsRef.current;
        const style = { color: '#ffde00', weight: 3, bubblingMouseEvents: true };
        if (pts.length >= 2) {
          shape =
            modeRef.current === 'area'
              ? L.polygon(latlngs(), { ...style, fillOpacity: 0.18 }).addTo(map!)
              : L.polyline(latlngs(), style).addTo(map!);
        } else shape = null;
        pts.forEach(([lng, lat], i) => {
          const m = L.marker([lat, lng], { icon, draggable: true, keyboard: false }).addTo(map!);
          m.on('drag', () => {
            const p = m.getLatLng();
            pointsRef.current = pointsRef.current.map((q, j) => (j === i ? [p.lng, p.lat] : q));
            shape?.setLatLngs(latlngs());
            setPoints(pointsRef.current);
          });
          m.on('dragend', () => {
            lastDragEndAt = Date.now();
          });
          corners.push(m);
        });
        setPoints(pts);
      };
      redrawRef.current = redraw;
      redraw();

      // Open on the phone's position rather than wherever the map was last
      // left (or the whole country), unless the user moves the map first.
      // Any move (a drag, a zoom, a postcode search) or a corner already
      // tapped means the user has chosen where to look: leave it there.
      const here = map;
      here.on('movestart', () => (movedRef.current = true));
      void onePosition(locating.signal).then((f) => {
        if (!f || cancelled || movedRef.current || pointsRef.current.length > 0 || mapRef.current !== here) return;
        showYouRef.current(f);
        here.setView([f.lat, f.lng], Math.max(here.getZoom(), 17));
      });

      map.on('click', (e: Leaflet.LeafletMouseEvent) => {
        // Letting go of a dragged corner must not also drop a new one there.
        if (Date.now() - lastDragEndAt < 300) return;
        pointsRef.current = [...pointsRef.current, [e.latlng.lng, e.latlng.lat]];
        redraw();
      });
    })();

    return () => {
      cancelled = true;
      locating.abort();
      stopWalkRef.current?.();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  const showYou = (f: Fix) => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!youRef.current) {
      youRef.current = L.circleMarker([f.lat, f.lng], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#1c7ed6',
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    } else youRef.current.setLatLng([f.lat, f.lng]);
  };

  const showYouRef = useRef(showYou);
  showYouRef.current = showYou;

  const findPlace = async () => {
    const q = place.trim().toUpperCase();
    if (!q) return;
    setFinding(true);
    setPlaceError(null);
    try {
      const compact = q.replace(/\s+/g, '');
      const full = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact);
      const r = await fetch(`https://api.postcodes.io/${full ? 'postcodes' : 'outcodes'}/${encodeURIComponent(compact)}`);
      const j = r.ok ? await r.json() : null;
      const lat = j?.result?.latitude;
      const lng = j?.result?.longitude;
      if (typeof lat === 'number' && typeof lng === 'number') mapRef.current?.setView([lat, lng], full ? 17 : 14);
      else setPlaceError('We couldn’t find that postcode. Try the full one, such as SO51 6AB.');
    } catch {
      setPlaceError('Couldn’t look that up just now. Try again, or move the map by hand.');
    }
    setFinding(false);
  };

  const whereIAm = async () => {
    setFinding(true);
    setPlaceError(null);
    const f = await onePosition();
    setFinding(false);
    if (!f) {
      setPlaceError('Couldn’t get your position. Type a postcode instead.');
      return;
    }
    showYou(f);
    mapRef.current?.setView([f.lat, f.lng], 18);
  };

  const startWalk = async () => {
    setPlaceError(null);
    setWalking(true);
    setWalkFix(null);
    let first = true;
    const failWalk = () => {
      setWalking(false);
      setPlaceError('The phone won’t share its position. Allow location for this app or site, or tap the corners instead.');
    };
    const stop = await watchPosition(
      (f) => {
        setWalkFix(f.accuracy);
        showYou(f);
        if (first) {
          first = false;
          mapRef.current?.setView([f.lat, f.lng], Math.max(mapRef.current.getZoom(), 18));
        }
        const pts = pointsRef.current;
        const next: LngLat = [f.lng, f.lat];
        if (keepWalkPoint(pts[pts.length - 1], next, f.accuracy)) {
          pointsRef.current = [...pts, next];
          redrawRef.current();
        }
      },
      failWalk,
    ).catch(() => {
      failWalk();
      return null;
    });
    // Left the page while the watch was starting: stop it rather than leak it.
    if (stop && !mapRef.current) stop();
    else stopWalkRef.current = stop;
  };

  const stopWalk = () => {
    stopWalkRef.current?.();
    stopWalkRef.current = null;
    setWalking(false);
    setWalkFix(null);
  };

  const area = mode === 'area' ? measureArea(points) : null;
  const lengthM = mode === 'length' ? pathLengthM(points, false) : 0;
  const acres = area?.kind === 'area' ? acresParam(area.acres) : null;

  if (failed) {
    return (
      <p className={css.unavailable}>
        The map won’t load just now. Check your signal and open this page again.
      </p>
    );
  }

  return (
    <section className={css.tool}>
      <form
        className={css.find}
        onSubmit={(e) => {
          e.preventDefault();
          void findPlace();
        }}
      >
        <input
          className={css.input}
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Postcode"
          aria-label="Postcode"
          autoComplete="postal-code"
          autoCapitalize="characters"
          enterKeyHint="go"
        />
        <button type="submit" className={css.btn} disabled={finding}>
          Go
        </button>
        <button type="button" className={css.btnGhost} disabled={finding} onClick={() => void whereIAm()}>
          {finding ? 'Finding…' : 'Where I am'}
        </button>
      </form>
      {placeError && (
        <p className={css.error} role="alert">
          {placeError}
        </p>
      )}

      <div className={css.modes} role="radiogroup" aria-label="What to measure">
        {(['area', 'length'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? css.modeOn : css.mode} onClick={() => setMode(m)}>
            {m === 'area' ? 'An area' : 'A length'}
          </button>
        ))}
      </div>

      <div ref={containerRef} className={css.map} />

      <div className={css.controls}>
        <button type="button" className={css.btnGhost} disabled={points.length === 0} onClick={() => setAll(pointsRef.current.slice(0, -1))}>
          Undo
        </button>
        <button type="button" className={css.btnGhost} disabled={points.length === 0 || walking} onClick={() => setAll([])}>
          Clear
        </button>
        {walking ? (
          <button type="button" className={css.btnStop} onClick={stopWalk}>
            Stop walking
          </button>
        ) : (
          <button type="button" className={css.btnGhost} onClick={() => void startWalk()}>
            Walk the edge
          </button>
        )}
      </div>
      {walking && (
        <p className={css.hint} aria-live="polite">
          {walkFix === null
            ? 'Waiting for GPS…'
            : walkFix > 15
              ? `GPS is rough (±${Math.round(walkFix)} m). Stand in the open for a moment.`
              : `Walking: a point every few metres (GPS ±${Math.round(walkFix)} m). Keep the screen on.`}
        </p>
      )}

      <div className={css.result} aria-live="polite">
        {mode === 'area' ? (
          !area || area.kind === 'none' ? (
            <p className={css.empty}>Tap the corners of the field, one by one, going round the edge. Drag a corner to move it.</p>
          ) : area.kind === 'crossed' ? (
            <p className={css.empty}>That outline crosses itself. Undo, and go round the edge in order.</p>
          ) : (
            <>
              <p className={css.resultLabel}>Area</p>
              <p className={css.resultMain}>
                {fig(area.acres)} acres <span>· {fig(area.ha)} ha</span>
              </p>
              <ul className={css.resultList}>
                <li>
                  <strong>{Math.round(area.m2).toLocaleString('en-GB')} m²</strong>
                </li>
                <li>
                  Round the edge: <strong>{metres(area.perimeterM)}</strong>
                </li>
              </ul>
            </>
          )
        ) : points.length < 2 ? (
          <p className={css.empty}>Tap along the hedge, fence or ditch, end to end.</p>
        ) : (
          <>
            <p className={css.resultLabel}>Length</p>
            <p className={css.resultMain}>{metres(lengthM)}</p>
            <ul className={css.resultList}>
              <li>
                <strong>{Math.round(lengthM * 1.0936).toLocaleString('en-GB')} yards</strong>
              </li>
            </ul>
          </>
        )}
      </div>

      {acres && (
        <nav className={css.use} aria-label="Use this area">
          <span>Use {acres} acres in:</span>
          <Link href={`/info/spray-rates?acres=${acres}`}>Spray rates</Link>
          <Link href={`/info/fertiliser?acres=${acres}`}>Fertilising</Link>
          <Link href={`/info/seeding?acres=${acres}`}>Seeding</Link>
        </nav>
      )}
    </section>
  );
}
