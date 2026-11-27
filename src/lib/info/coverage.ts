/**
 * The sums behind /info/coverage-map: a machine of a set working width
 * drives a field, and the ground its width has passed over is painted onto a
 * grid of small square cells. The grid gives the area covered, the area
 * covered twice or more (overlap), and the picture the map draws.
 *
 * Pure: no map library and no DOM, so the live map, the saved-run map and the
 * server (which recomputes a run's figures before storing them) all count the
 * same track the same way.
 *
 * A track is a list of sections, one per stretch of work. Pausing to refill
 * ends a section; resuming starts the next, and nothing is painted across
 * the gap between them.
 */
import { distanceM, type LngLat } from './areaMaths';
import { M2_PER_HA } from './sprayMaths';

/** [lng, lat, seconds since the run started, GPS accuracy in metres]. */
export type TrackPoint = [number, number, number, number];
export type Track = TrackPoint[][];

export const MIN_WIDTH_M = 0.5;
export const MAX_WIDTH_M = 60;

/**
 * A fix is used only when it is this good. A plug-in receiver gives 1 to
 * 3 m; a phone on its own 5 to 10 m in the open and worse near trees.
 */
export const MAX_ACCURACY_M = 10;
/** Closer than this to the last point and a fix adds nothing but jitter. */
export const STEP_M = 1;
/** Faster than this between two fixes is a GPS jump, not a tractor. */
const MAX_SPEED_MS = 25;

/** Whether a new fix becomes the next point of the track. */
export function keepFix(last: TrackPoint | undefined, next: TrackPoint): boolean {
  if (!(next[3] <= MAX_ACCURACY_M)) return false;
  if (!last) return true;
  const d = distanceM([last[0], last[1]], [next[0], next[1]]);
  if (d < STEP_M) return false;
  const dt = next[2] - last[2];
  return dt > 0 ? d / dt <= MAX_SPEED_MS : false;
}

/**
 * Cell size for a working width: about a sixteenth of it, between 0.2 m and
 * 1 m, so a 1.5 m quad sprayer and a 24 m boom both draw cleanly and a
 * 50 ha field stays well under a million cells.
 */
export function cellSizeFor(widthM: number): number {
  return Math.min(1, Math.max(0.2, widthM / 16));
}

/** Cells along each side of a tile; tiles are made as the machine reaches them. */
export const TILE = 128;

export type Tile = {
  tx: number;
  ty: number;
  /** Times each cell was passed over, row by row from the south edge up. */
  count: Uint8Array;
  /** Distance along the track when each cell was last painted. */
  last: Float32Array;
  dirty: boolean;
};

const EARTH_RADIUS_M = 6371000;
const RAD = Math.PI / 180;

export type CoverageStats = {
  coveredHa: number;
  /** Ground passed over twice or more. */
  overlapHa: number;
  /** Ground times passes: what the machine put out, in hectares' worth. */
  appliedHa: number;
  distanceM: number;
  activeSeconds: number;
};

export class CoverageGrid {
  readonly widthM: number;
  readonly cell: number;
  readonly origin: LngLat;
  readonly tiles = new Map<string, Tile>();
  private readonly kx: number;
  private readonly ky: number;
  /**
   * Within one pass the strip painted by one stretch of track overlaps the
   * next at every bend. A cell painted again within this distance along the
   * track is the same pass, not a second one; coming back to it later
   * (the next bout, a second go over a corner) is.
   */
  private readonly samePassM: number;
  private covered = 0;
  private overlap = 0;
  private applied = 0;
  private along = 0;
  /** Added to `along` for painting only, so the distance figure stays true. */
  private gap = 0;
  private active = 0;
  private prev: TrackPoint | null = null;
  private sectionStart: TrackPoint | null = null;
  private segmentsInSection = 0;
  /** Direction of the last stretch painted, for the wedge at the next bend. */
  private ux = 0;
  private uy = 0;

  constructor(widthM: number, origin: LngLat) {
    this.widthM = widthM;
    this.cell = cellSizeFor(widthM);
    this.origin = origin;
    this.ky = EARTH_RADIUS_M * RAD;
    this.kx = this.ky * Math.cos(origin[1] * RAD);
    this.samePassM = Math.max(1.5 * widthM, 2);
  }

  toXY([lng, lat]: LngLat): [number, number] {
    return [(lng - this.origin[0]) * this.kx, (lat - this.origin[1]) * this.ky];
  }
  toLngLat(x: number, y: number): LngLat {
    return [this.origin[0] + x / this.kx, this.origin[1] + y / this.ky];
  }

  /** Begin a stretch of work: the first point after a start or a resume. */
  startSection() {
    this.closeSection();
    // Ground gone over again after a pause is a second pass, however close
    // to where the last stretch stopped: the gap is not distance travelled,
    // so the counter steps over the same-pass window instead.
    if (this.prev) this.gap += this.samePassM + 1;
    this.prev = null;
    this.segmentsInSection = 0;
  }

  private closeSection() {
    if (this.prev && this.sectionStart) this.active += this.prev[2] - this.sectionStart[2];
    this.sectionStart = null;
  }

  addPoint(p: TrackPoint) {
    const prev = this.prev;
    this.prev = p;
    if (!prev) {
      this.sectionStart = p;
      return;
    }
    const [ax, ay] = this.toXY([prev[0], prev[1]]);
    const [bx, by] = this.toXY([p[0], p[1]]);
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) return;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    // The outside of a bend, where two butt-ended strips leave a wedge.
    if (this.segmentsInSection > 0) this.paintWedge(ax, ay, this.along + this.gap, this.ux, this.uy, ux, uy);
    this.paintStrip(ax, ay, bx, by, len, this.along + this.gap);
    this.ux = ux;
    this.uy = uy;
    this.along += len;
    this.segmentsInSection++;
  }

  stats(): CoverageStats {
    const c2 = this.cell * this.cell;
    const openSection = this.prev && this.sectionStart ? this.prev[2] - this.sectionStart[2] : 0;
    return {
      coveredHa: (this.covered * c2) / M2_PER_HA,
      overlapHa: (this.overlap * c2) / M2_PER_HA,
      appliedHa: (this.applied * c2) / M2_PER_HA,
      distanceM: this.along,
      activeSeconds: this.active + openSection,
    };
  }

  /** Tiles changed since the last call, for the map to redraw. */
  takeDirty(): Tile[] {
    const out: Tile[] = [];
    for (const t of this.tiles.values()) {
      if (t.dirty) {
        t.dirty = false;
        out.push(t);
      }
    }
    return out;
  }

  /** A tile's corners as [south-west, north-east] in [lng, lat]. */
  tileBounds(t: Tile): [LngLat, LngLat] {
    const span = TILE * this.cell;
    return [this.toLngLat(t.tx * span, t.ty * span), this.toLngLat((t.tx + 1) * span, (t.ty + 1) * span)];
  }

  private paint(cx: number, cy: number, d: number) {
    const tx = Math.floor(cx / TILE);
    const ty = Math.floor(cy / TILE);
    const key = `${tx},${ty}`;
    let t = this.tiles.get(key);
    if (!t) {
      t = { tx, ty, count: new Uint8Array(TILE * TILE), last: new Float32Array(TILE * TILE), dirty: true };
      this.tiles.set(key, t);
    }
    const i = (cy - ty * TILE) * TILE + (cx - tx * TILE);
    const c = t.count[i];
    if (c === 0) {
      t.count[i] = 1;
      this.covered++;
      this.applied++;
      t.dirty = true;
    } else if (d - t.last[i] > this.samePassM) {
      if (c < 255) t.count[i] = c + 1;
      if (c === 1) this.overlap++;
      this.applied++;
      t.dirty = true;
    }
    t.last[i] = d;
  }

  /** The strip the width sweeps from a to b; every cell whose centre is inside. */
  private paintStrip(ax: number, ay: number, bx: number, by: number, len: number, d0: number) {
    const h = this.widthM / 2;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const nx = -uy * h;
    const ny = ux * h;
    const xs = [ax + nx, ax - nx, bx + nx, bx - nx];
    const ys = [ay + ny, ay - ny, by + ny, by - ny];
    const s = this.cell;
    const x0 = Math.floor(Math.min(...xs) / s);
    const x1 = Math.floor(Math.max(...xs) / s);
    const y0 = Math.floor(Math.min(...ys) / s);
    const y1 = Math.floor(Math.max(...ys) / s);
    for (let cy = y0; cy <= y1; cy++) {
      const ry = (cy + 0.5) * s - ay;
      for (let cx = x0; cx <= x1; cx++) {
        const rx = (cx + 0.5) * s - ax;
        const t = rx * ux + ry * uy;
        if (t < 0 || t > len) continue;
        if (Math.abs(rx * -uy + ry * ux) > h) continue;
        this.paint(cx, cy, d0 + t);
      }
    }
  }

  /**
   * At a bend: cells within half the width of the bend point that lie past
   * the end of the strip coming in and before the start of the strip going
   * out. On a straight line that is nothing; on a bend it is the wedge.
   */
  private paintWedge(x: number, y: number, d: number, inX: number, inY: number, outX: number, outY: number) {
    const h = this.widthM / 2;
    const s = this.cell;
    for (let cy = Math.floor((y - h) / s); cy <= Math.floor((y + h) / s); cy++) {
      const ry = (cy + 0.5) * s - y;
      for (let cx = Math.floor((x - h) / s); cx <= Math.floor((x + h) / s); cx++) {
        const rx = (cx + 0.5) * s - x;
        if (rx * rx + ry * ry > h * h) continue;
        if (rx * inX + ry * inY < 0 || rx * outX + ry * outY > 0) continue;
        this.paint(cx, cy, d);
      }
    }
  }
}

/** Paint a whole track, as a saved run or an unfinished one is reopened. */
export function replay(track: Track, widthM: number): CoverageGrid | null {
  const first = track.find((s) => s.length > 0)?.[0];
  if (!first) return null;
  const grid = new CoverageGrid(widthM, [first[0], first[1]]);
  for (const section of track) {
    grid.startSection();
    for (const p of section) grid.addPoint(p);
  }
  return grid;
}

/** The colours a cell is drawn in: once over, and twice or more. */
export const COVER_RGBA: [number, number, number, number] = [30, 144, 255, 150];
export const OVERLAP_RGBA: [number, number, number, number] = [255, 86, 0, 200];

/**
 * A tile's picture into an RGBA buffer (TILE x TILE, top row first, as a
 * canvas wants it). Untouched cells are left clear.
 */
export function tilePixels(t: Tile, out: Uint8ClampedArray) {
  out.fill(0);
  for (let row = 0; row < TILE; row++) {
    const src = (TILE - 1 - row) * TILE;
    const dst = row * TILE * 4;
    for (let col = 0; col < TILE; col++) {
      const c = t.count[src + col];
      if (c === 0) continue;
      const rgba = c === 1 ? COVER_RGBA : OVERLAP_RGBA;
      const o = dst + col * 4;
      out[o] = rgba[0];
      out[o + 1] = rgba[1];
      out[o + 2] = rgba[2];
      out[o + 3] = rgba[3];
    }
  }
}

/* ---------- Storing a track ---------- */

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Perpendicular distance from p to the line a-b, in the grid's metres. */
function offLine(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

/**
 * The track as it is stored: points on a straight bout that add nothing
 * (within `toleranceM` of the line through their neighbours) are dropped,
 * and figures are rounded to a centimetre and a second. A morning's work
 * goes from thousands of points to hundreds.
 */
export function simplifyTrack(track: Track, toleranceM = 0.1): Track {
  const first = track.find((s) => s.length > 0)?.[0];
  if (!first) return [];
  const lat0 = first[1] * RAD;
  const xy = (p: TrackPoint): [number, number] => [p[0] * EARTH_RADIUS_M * RAD * Math.cos(lat0), p[1] * EARTH_RADIUS_M * RAD];
  return track
    .filter((s) => s.length > 0)
    .map((s) => {
      const pts = s.map(xy);
      const keep = new Uint8Array(s.length);
      keep[0] = 1;
      keep[s.length - 1] = 1;
      const stack: [number, number][] = s.length > 2 ? [[0, s.length - 1]] : [];
      while (stack.length) {
        const [i, j] = stack.pop()!;
        let worst = -1;
        let at = -1;
        for (let k = i + 1; k < j; k++) {
          const d = offLine(pts[k], pts[i], pts[j]);
          if (d > worst) {
            worst = d;
            at = k;
          }
        }
        if (at > 0 && worst > toleranceM) {
          keep[at] = 1;
          stack.push([i, at], [at, j]);
        }
      }
      return s.filter((_, k) => keep[k]).map((p): TrackPoint => [round(p[0], 7), round(p[1], 7), Math.round(p[2]), round(p[3], 1)]);
    });
}

export const MAX_TRACK_POINTS = 100000;
const MAX_SECTIONS = 1000;

/** A stored or posted track, checked point by point; null when it is not one. */
export function parseTrack(raw: unknown): Track | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SECTIONS) return null;
  let total = 0;
  const out: Track = [];
  for (const s of raw) {
    if (!Array.isArray(s)) return null;
    total += s.length;
    if (total > MAX_TRACK_POINTS) return null;
    const section: TrackPoint[] = [];
    let lastT = -Infinity;
    for (const p of s) {
      if (!Array.isArray(p) || p.length !== 4 || !p.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
      const [lng, lat, t, acc] = p as TrackPoint;
      if (lng < -180 || lng > 180 || lat < -85 || lat > 85 || t < 0 || t < lastT || acc < 0) return null;
      lastT = t;
      section.push([lng, lat, t, acc]);
    }
    if (section.length) out.push(section);
  }
  return out.some((s) => s.length >= 2) ? out : null;
}

/** Bounds of a track as [south-west, north-east] in [lng, lat]. */
export function trackBounds(track: Track): [LngLat, LngLat] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const sec of track)
    for (const [lng, lat] of sec) {
      w = Math.min(w, lng);
      e = Math.max(e, lng);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}

/* ---------- The jobs a run can be ---------- */

export const RUN_TASKS = ['spray', 'fertiliser', 'seed', 'other'] as const;
export type RunTask = (typeof RUN_TASKS)[number];
export const TASK_LABEL: Record<RunTask, string> = {
  spray: 'Spraying',
  fertiliser: 'Fertilising',
  seed: 'Seeding',
  other: 'Other work',
};
