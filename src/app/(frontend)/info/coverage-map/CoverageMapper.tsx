'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type * as Leaflet from 'leaflet';
import {
  CoverageGrid,
  keepFix,
  MAX_ACCURACY_M,
  MAX_WIDTH_M,
  MIN_WIDTH_M,
  replay,
  RUN_TASKS,
  trackBounds,
  simplifyTrack,
  TASK_LABEL,
  type CoverageStats,
  type RunTask,
  type Track,
  type TrackPoint,
} from '@/lib/info/coverage';
import { ACRES_PER_HA, fig } from '@/lib/info/sprayMaths';
import { watchPosition, type Fix } from '@/lib/info/position';
import { holdScreenOn, type ScreenHold } from '@/lib/app/keepAwake';
import { coverageLayer, makeMap, MAPBOX_TOKEN, type CoverageLayer } from './mapLayer';
import { saveCoverageRunAction } from './actions';
import css from './coverage.module.css';

/**
 * The live coverage map. Set the machine's working width, press Start, and
 * the ground the width passes over fills in on the satellite map as the
 * machine moves: blue once, orange where it has been over twice. Pause to
 * refill (nothing is painted while paused), Resume on the line, Finish, Save.
 *
 * The run in progress is kept on the phone as it goes, so a crash, a call or
 * the app being closed loses nothing: it reopens paused where it stopped.
 */

const RUN_KEY = 'ea_coverage_run';
const SETUP_KEY = 'ea_coverage_setup';
const VIEW_KEY = 'ea_info_area_view'; // shared with the Area map: same fields
const UK = { lat: 54.4, lng: -2.6, zoom: 6 };
/** Longer than this without a usable fix and the next one starts a new stretch, not a straight line across. */
const GAP_S = 20;

type Phase = 'setup' | 'working' | 'paused' | 'done';
type Saved = {
  v: 1;
  phase: Phase;
  task: RunTask;
  site: string;
  widthM: number;
  startedAt: number;
  endedAt: number | null;
  track: Track;
};

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function store(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

const duration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
const ZERO: CoverageStats = {
  coveredHa: 0,
  overlapHa: 0,
  appliedHa: 0,
  distanceM: 0,
  activeSeconds: 0,
};

export function CoverageMapper({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<CoverageLayer | null>(null);
  const youRef = useRef<Leaflet.CircleMarker | null>(null);
  const boomRef = useRef<Leaflet.Polyline | null>(null);
  const gridRef = useRef<CoverageGrid | null>(null);
  const runRef = useRef<Saved | null>(null);
  const stopGpsRef = useRef<(() => void) | null>(null);
  const holdRef = useRef<ScreenHold | null>(null);
  const followRef = useRef(true);
  const lastFixRef = useRef<Fix | null>(null);
  const headingRef = useRef<[number, number] | null>(null);
  const lastStoreRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(!MAPBOX_TOKEN);
  const [phase, setPhaseState] = useState<Phase>('setup');
  const [task, setTask] = useState<RunTask>('spray');
  const [site, setSite] = useState('');
  const [widthText, setWidthText] = useState('');
  const [stats, setStats] = useState<CoverageStats>(ZERO);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [follow, setFollowState] = useState(true);
  const [screen, setScreen] = useState<ScreenHold['how'] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const setFollow = (on: boolean) => {
    followRef.current = on;
    setFollowState(on);
  };

  const persist = useCallback((force = false) => {
    const run = runRef.current;
    if (!run) return;
    const now = Date.now();
    if (!force && now - lastStoreRef.current < 10000) return;
    lastStoreRef.current = now;
    store(RUN_KEY, run);
  }, []);

  const setPhase = (p: Phase) => {
    if (runRef.current) runRef.current.phase = p;
    setPhaseState(p);
    persist(true);
  };

  /* ---------- the map ---------- */

  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    let cancelled = false;
    const saved = load<Saved>(RUN_KEY);
    const setup = load<{ task?: RunTask; widthM?: number }>(SETUP_KEY);
    if (setup?.task && (RUN_TASKS as readonly string[]).includes(setup.task)) setTask(setup.task);
    if (setup?.widthM) setWidthText(String(setup.widthM));

    (async () => {
      const view = load<typeof UK>(VIEW_KEY);
      const made = await makeMap(
        containerRef.current!,
        view && Number.isFinite(view.lat) ? view : UK,
        () => !cancelled && setFailed(true),
        () => !cancelled,
      );
      if (made === 'gone') return;
      if (!made) {
        setFailed(true);
        return;
      }
      const { L, map } = made;
      LRef.current = L;
      mapRef.current = map;
      layerRef.current = coverageLayer(L, map, css.coverTile);
      map.on('dragstart', () => setFollow(false));
      map.on('moveend', () => {
        const c = map.getCenter();
        store(VIEW_KEY, { lat: c.lat, lng: c.lng, zoom: map.getZoom() });
      });

      // An unfinished run on this phone: put it back, paused.
      if (saved?.v === 1 && Array.isArray(saved.track) && saved.phase !== 'setup') {
        runRef.current = {
          ...saved,
          phase: saved.phase === 'done' ? 'done' : 'paused',
        };
        setTask(saved.task);
        setSite(saved.site);
        setWidthText(String(saved.widthM));
        try {
          const grid = replay(saved.track, saved.widthM);
          gridRef.current = grid;
          const b = trackBounds(saved.track);
          if (grid) {
            layerRef.current.sync(grid);
            setStats(grid.stats());
          }
          if (b)
            map.fitBounds(
              [
                [b[0][1], b[0][0]],
                [b[1][1], b[1][0]],
              ],
              { padding: [30, 30], maxZoom: 19 },
            );
        } catch (err) {
          // Still offered back (Resume, Save, Discard); only the picture failed.
          console.error('[coverageMap] could not redraw the unfinished run:', err);
        }
        setPhaseState(runRef.current.phase);
        if (runRef.current.phase === 'paused') setNotice('Picked up the run where it stopped. Tap Resume when you are back on the line.');
        // The map shows the run; the position waits for Resume.
        followRef.current = false;
      } else {
        // Nothing to pick up: find the phone straight away, so the map opens
        // on the field rather than the whole country.
        void startGpsRef.current();
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
      stopGpsRef.current?.();
      stopGpsRef.current = null;
      holdRef.current?.release();
      holdRef.current = null;
      persist(true);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [persist]);

  // Leaving the app or locking the phone: write the run down now.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') persist(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [persist]);

  /* ---------- the position ---------- */

  const drawMachine = (f: Fix) => {
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
    youRef.current.bringToFront();

    // The working width across the machine, square to the way it is going.
    const run = runRef.current;
    const h = headingRef.current;
    if (run && h) {
      const half = run.widthM / 2;
      const mLat = 1 / 111195;
      const mLng = mLat / Math.cos((f.lat * Math.PI) / 180);
      const [nx, ny] = [-h[1], h[0]];
      const a: [number, number] = [f.lat + ny * half * mLat, f.lng + nx * half * mLng];
      const b: [number, number] = [f.lat - ny * half * mLat, f.lng - nx * half * mLng];
      if (!boomRef.current)
        boomRef.current = L.polyline([a, b], {
          color: '#ffde00',
          weight: 5,
          interactive: false,
          lineCap: 'butt',
        }).addTo(map);
      else boomRef.current.setLatLngs([a, b]);
    }
    if (followRef.current) map.panTo([f.lat, f.lng], { animate: false });
  };

  const onFix = (f: Fix) => {
    const prevFix = lastFixRef.current;
    lastFixRef.current = f;
    setAccuracy(f.accuracy);
    if (prevFix && f.at > prevFix.at) {
      const dLat = (f.lat - prevFix.lat) * 111195;
      const dLng = (f.lng - prevFix.lng) * 111195 * Math.cos((f.lat * Math.PI) / 180);
      const d = Math.hypot(dLat, dLng);
      setSpeedKmh((d / ((f.at - prevFix.at) / 1000)) * 3.6);
      if (d > 0.5) headingRef.current = [dLng / d, dLat / d];
    }

    const run = runRef.current;
    if (run && run.phase === 'working') {
      const p: TrackPoint = [f.lng, f.lat, Math.max(0, (f.at - run.startedAt) / 1000), f.accuracy];
      let section = run.track[run.track.length - 1];
      const last = section[section.length - 1];
      if (last && p[2] - last[2] > GAP_S && keepFix(undefined, p)) {
        // The phone went quiet (locked, another app, lost the sky): start a
        // new stretch here rather than paint a straight line across the gap.
        run.track.push([]);
        section = run.track[run.track.length - 1];
        gridRef.current?.startSection();
        setNotice(`The GPS went quiet for ${Math.round(p[2] - last[2])} seconds. The map carries on from here; the gap is left unpainted.`);
      }
      if (keepFix(section[section.length - 1], p)) {
        section.push(p);
        if (!gridRef.current) {
          gridRef.current = new CoverageGrid(run.widthM, [p[0], p[1]]);
          gridRef.current.startSection();
        }
        gridRef.current.addPoint(p);
        layerRef.current?.sync(gridRef.current);
        setStats(gridRef.current.stats());
        persist();
      }
    }
    drawMachine(f);
  };
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  /**
   * Every start and stop moves this on. A watch that finishes starting after
   * Finish or Discard was pressed, or a refusal the browser reports after the
   * watch began, belongs to an older number and is stopped rather than kept.
   */
  const gpsGenRef = useRef(0);
  const deniedText = 'The phone won’t share its position. Allow location for this app (Settings › Privacy › Location Services) and try again.';

  const startGps = async () => {
    if (stopGpsRef.current) return true;
    const gen = ++gpsGenRef.current;
    let ok = true;
    const stop = await watchPosition(
      (f) => onFixRef.current(f),
      () => {
        ok = false;
        setError(deniedText);
        // Refused after the watch had started (the browser asks, then says
        // no): stop it and pause, so Resume can ask again.
        if (gen === gpsGenRef.current && stopGpsRef.current) {
          stopGps();
          releaseScreen();
          if (runRef.current?.phase === 'working') setPhase('paused');
        }
      },
    ).catch(() => null);
    if (!stop || !ok || gen !== gpsGenRef.current || !mapRef.current) {
      stop?.();
      return false;
    }
    stopGpsRef.current = stop;
    return true;
  };
  const startGpsRef = useRef(startGps);
  startGpsRef.current = startGps;
  const stopGps = () => {
    gpsGenRef.current++;
    stopGpsRef.current?.();
    stopGpsRef.current = null;
  };

  /** Whether the screen should be held now; a hold granted after it stopped being wanted is let go at once. */
  const wantScreenRef = useRef(false);
  const holdScreen = async () => {
    wantScreenRef.current = true;
    if (holdRef.current) return;
    const hold = await holdScreenOn();
    if (!wantScreenRef.current || holdRef.current) {
      hold.release();
      return;
    }
    holdRef.current = hold;
    setScreen(hold.how);
  };
  const releaseScreen = () => {
    wantScreenRef.current = false;
    holdRef.current?.release();
    holdRef.current = null;
    setScreen(null);
  };

  /* ---------- the buttons ---------- */

  const widthM = Number(widthText.replace(',', '.'));
  const widthOk = widthM >= MIN_WIDTH_M && widthM <= MAX_WIDTH_M;

  const start = async () => {
    setError(null);
    setNotice(null);
    if (!widthOk) {
      setError(`Give the machine’s working width in metres, between ${MIN_WIDTH_M} and ${MAX_WIDTH_M}.`);
      return;
    }
    store(SETUP_KEY, { task, widthM });
    layerRef.current?.clear();
    boomRef.current?.remove();
    boomRef.current = null;
    gridRef.current = null;
    runRef.current = {
      v: 1,
      phase: 'working',
      task,
      site: site.trim(),
      widthM,
      startedAt: Date.now(),
      endedAt: null,
      track: [[]],
    };
    setStats(ZERO);
    setFollow(true);
    setPhase('working');
    // Asked for first, while the tap still counts: Safari wants the screen
    // lock to come from a press, and the location prompt would use it up.
    void holdScreen();
    if (!(await startGps())) {
      releaseScreen();
      runRef.current = null;
      store(RUN_KEY, null);
      setPhaseState('setup');
    }
  };

  const pause = () => {
    setNotice(null);
    setPhase('paused');
  };

  const resume = async () => {
    const run = runRef.current;
    if (!run) return;
    setError(null);
    setNotice(null);
    if (run.track[run.track.length - 1].length > 0) {
      run.track.push([]);
      gridRef.current?.startSection();
    }
    setFollow(true);
    setPhase('working');
    void holdScreen();
    if (!(await startGps())) {
      releaseScreen();
      setPhase('paused');
    }
  };

  const finish = () => {
    const run = runRef.current;
    if (!run) return;
    run.endedAt = Date.now();
    run.site = site.trim();
    stopGps();
    releaseScreen();
    setNotice(null);
    setPhase('done');
  };

  const carryOn = () => {
    if (runRef.current) runRef.current.endedAt = null;
    void resume();
  };

  const discard = () => {
    stopGps();
    releaseScreen();
    runRef.current = null;
    gridRef.current = null;
    store(RUN_KEY, null);
    layerRef.current?.clear();
    boomRef.current?.remove();
    boomRef.current = null;
    setStats(ZERO);
    setNotice(null);
    setDiscarding(false);
    setPhaseState('setup');
    setFollow(true);
    void startGps();
  };

  const save = async () => {
    const run = runRef.current;
    if (!run) return;
    setSaving(true);
    setError(null);
    run.site = site.trim();
    run.task = task;
    persist(true);
    const res = await saveCoverageRunAction({
      task: run.task,
      site: run.site,
      widthM: run.widthM,
      startedAt: run.startedAt,
      endedAt: run.endedAt ?? Date.now(),
      track: simplifyTrack(run.track),
    }).catch(() => ({
      ok: false as const,
      error: 'That didn’t save. Check your signal and try again: the run is still on this phone.',
    }));
    if (!res.ok) {
      setSaving(false);
      setError(res.error);
      return;
    }
    store(RUN_KEY, null);
    runRef.current = null;
    router.push(`/info/coverage-map/${res.id}`);
  };

  const recentre = () => {
    setFollow(true);
    const f = lastFixRef.current;
    if (f) mapRef.current?.setView([f.lat, f.lng], Math.max(mapRef.current.getZoom(), 18));
  };

  // The map is taller while working; Leaflet has to be told.
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [phase]);

  // First fix (on opening, or on Resume after a reopened run): zoom in to
  // working height on the phone's position.
  const zoomedRef = useRef(false);
  useEffect(() => {
    if ((phase === 'setup' || phase === 'working') && accuracy !== null && !zoomedRef.current && lastFixRef.current && mapRef.current) {
      zoomedRef.current = true;
      if (followRef.current || mapRef.current.getZoom() < 15) {
        setFollow(true);
        mapRef.current.setView([lastFixRef.current.lat, lastFixRef.current.lng], Math.max(mapRef.current.getZoom(), 18));
      }
    }
  }, [phase, accuracy]);

  if (failed) {
    return <p className={css.unavailable}>The map won’t load just now. Check your signal and open this page again.</p>;
  }

  const live = phase === 'working' || phase === 'paused';
  const overlapPct = stats.coveredHa > 0 ? (stats.overlapHa / stats.coveredHa) * 100 : 0;
  const gpsWord =
    accuracy === null ? 'Waiting for GPS…' : accuracy > MAX_ACCURACY_M ? `GPS too rough (±${Math.round(accuracy)} m)` : `GPS ±${fig(accuracy)} m`;

  return (
    <section className={css.tool}>
      {phase === 'setup' && (
        <div className={css.setup}>
          <div className={css.tasks} role="radiogroup" aria-label="The job">
            {RUN_TASKS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={task === t}
                className={task === t ? css.taskOn : css.task}
                onClick={() => setTask(t)}
              >
                {TASK_LABEL[t]}
              </button>
            ))}
          </div>
          <div className={css.setupRow}>
            <label className={css.field}>
              <span>Working width</span>
              <span className={css.inputRow}>
                <input
                  inputMode="decimal"
                  value={widthText}
                  onChange={(e) => setWidthText(e.target.value)}
                  placeholder="12"
                  aria-label="Working width in metres"
                />
                <span className={css.unit}>metres</span>
              </span>
            </label>
            <label className={css.field}>
              <span>Field (optional)</span>
              <span className={css.inputRow}>
                <input value={site} onChange={(e) => setSite(e.target.value)} maxLength={200} placeholder="Top paddock" />
              </span>
            </label>
          </div>
          <button type="button" className={css.go} disabled={!ready} onClick={() => void start()}>
            Start
          </button>
        </div>
      )}

      <div className={live ? css.live : css.inline}>
        {live && (
          <div className={css.bar} aria-live="polite">
            <div className={css.stat}>
              <span>Covered</span>
              <strong>{fig(stats.coveredHa * ACRES_PER_HA)} ac</strong>
              <em>{fig(stats.coveredHa)} ha</em>
            </div>
            <div className={css.stat}>
              <span>Overlap</span>
              <strong className={overlapPct >= 10 ? css.warn : undefined}>{Math.round(overlapPct)}%</strong>
              <em>{fig(stats.overlapHa * ACRES_PER_HA)} ac</em>
            </div>
            <div className={css.stat}>
              <span>Speed</span>
              <strong>{speedKmh === null || phase === 'paused' ? '–' : fig(Math.max(0, speedKmh))}</strong>
              <em>km/h</em>
            </div>
            <div className={css.stat}>
              <span>Width</span>
              <strong>{fig(runRef.current?.widthM ?? 0)} m</strong>
              <em>{duration(stats.activeSeconds)}</em>
            </div>
          </div>
        )}

        <div className={css.mapWrap}>
          {/* One fixed class: Leaflet adds its own to this element, and a changing
            className would have React wipe them. The live size comes from .live. */}
        <div ref={containerRef} className={css.map} />
          {phase !== 'done' && (
            <span
              className={accuracy !== null && accuracy <= 3 ? css.gpsGood : accuracy !== null && accuracy <= MAX_ACCURACY_M ? css.gps : css.gpsBad}
            >
              {gpsWord}
            </span>
          )}
          {phase !== 'done' && !follow && accuracy !== null && (
            <button type="button" className={css.recentre} onClick={recentre}>
              {live ? 'Follow the machine' : 'Where I am'}
            </button>
          )}
          {phase === 'paused' && <span className={css.pausedTag}>Paused: nothing is being painted</span>}
        </div>

        {notice && <p className={css.notice}>{notice}</p>}
        {error && (
          <p className={css.error} role="alert">
            {error}
          </p>
        )}

        {live && (
          <div className={css.controls}>
            {phase === 'working' ? (
              <button type="button" className={css.pause} onClick={pause}>
                Pause
              </button>
            ) : (
              <button type="button" className={css.go} onClick={() => void resume()}>
                Resume
              </button>
            )}
            <button type="button" className={css.finish} onClick={finish}>
              Finish
            </button>
          </div>
        )}
        {live && (
          <p className={css.hint}>
            {phase === 'working'
              ? screen === 'none'
                ? 'Keep this screen open: this phone won’t let us hold the screen on, so set Auto-Lock to Never (Settings › Display & Brightness) while you work.'
                : 'Keep this screen open. Locking the phone or switching app stops the map; it carries on when you come back.'
              : 'Refilling? Pause keeps the map; Resume once you are back where you stopped.'}
          </p>
        )}
      </div>

      {phase === 'done' && (
        <div className={css.done}>
          <p className={css.doneLabel}>{TASK_LABEL[task]} finished</p>
          <p className={css.doneMain}>
            {fig(stats.coveredHa * ACRES_PER_HA)} acres <span>· {fig(stats.coveredHa)} ha covered</span>
          </p>
          <ul className={css.doneList}>
            <li>
              Overlap: <strong>{fig(stats.overlapHa * ACRES_PER_HA)} acres</strong> ({Math.round(overlapPct)}%)
            </li>
            <li>
              Working: <strong>{duration(stats.activeSeconds)}</strong>, {fig(stats.distanceM / 1000)} km at {fig(runRef.current?.widthM ?? 0)} m wide
            </li>
          </ul>
          <div className={css.tasks} role="radiogroup" aria-label="The job">
            {RUN_TASKS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={task === t}
                className={task === t ? css.taskOn : css.task}
                onClick={() => setTask(t)}
              >
                {TASK_LABEL[t]}
              </button>
            ))}
          </div>
          <label className={css.field}>
            <span>Field</span>
            <span className={css.inputRow}>
              <input value={site} onChange={(e) => setSite(e.target.value)} maxLength={200} placeholder="Top paddock" />
            </span>
          </label>
          <div className={css.controls}>
            {signedIn ? (
              <button type="button" className={css.go} disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save the run'}
              </button>
            ) : (
              <Link href="/login?next=/info/coverage-map" className={css.go}>
                Sign in to save
              </Link>
            )}
            <button type="button" className={css.ghost} onClick={carryOn}>
              Carry on working
            </button>
            {discarding ? (
              <button type="button" className={css.danger} onClick={discard}>
                Yes, throw it away
              </button>
            ) : (
              <button type="button" className={css.ghost} onClick={() => setDiscarding(true)}>
                Discard
              </button>
            )}
          </div>
          {!signedIn && <p className={css.hint}>The run stays on this phone while you sign in.</p>}
        </div>
      )}
    </section>
  );
}
