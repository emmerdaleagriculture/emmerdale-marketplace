import { describe, expect, it } from 'vitest';
import {
  CoverageGrid,
  cellSizeFor,
  keepFix,
  parseTrack,
  replay,
  simplifyTrack,
  tilePixels,
  TILE,
  type Track,
  type TrackPoint,
} from './coverage';

// A field near Romsey. One degree of latitude is ~111,195 m.
const LNG0 = -1.5;
const LAT0 = 51.0;
const M_LAT = 1 / 111195;
const M_LNG = 1 / (111195 * Math.cos((LAT0 * Math.PI) / 180));

/** A point `x` metres east and `y` metres north of the corner, at time t. */
const at = (x: number, y: number, t: number, acc = 1): TrackPoint => [LNG0 + x * M_LNG, LAT0 + y * M_LAT, t, acc];

/** A straight bout northwards at x, from y0 to y1, a point every 2 m. */
function bout(x: number, y0: number, y1: number, t0: number): TrackPoint[] {
  const out: TrackPoint[] = [];
  const step = y1 > y0 ? 2 : -2;
  let t = t0;
  for (let y = y0; step > 0 ? y <= y1 : y >= y1; y += step) out.push(at(x, y, t++));
  return out;
}

describe('which fixes are kept', () => {
  it('keeps a good first fix and drops a rough one', () => {
    expect(keepFix(undefined, at(0, 0, 0, 2))).toBe(true);
    expect(keepFix(undefined, at(0, 0, 0, 25))).toBe(false);
  });
  it('drops jitter and jumps', () => {
    const a = at(0, 0, 0);
    expect(keepFix(a, at(0, 0.4, 1))).toBe(false); // standing still
    expect(keepFix(a, at(0, 3, 1))).toBe(true); // ~11 km/h
    expect(keepFix(a, at(0, 300, 1))).toBe(false); // 1,000 km/h
    expect(keepFix(a, at(0, 300, 60))).toBe(true); // back after a minute without a fix
  });
});

describe('painting coverage', () => {
  it('covers length x width for a straight bout', () => {
    const g = replay([bout(0, 0, 100, 0)], 12)!;
    const s = g.stats();
    // 100 m x 12 m = 0.12 ha, to within a cell's width along the edges.
    expect(s.coveredHa).toBeGreaterThan(0.118);
    expect(s.coveredHa).toBeLessThan(0.122);
    expect(s.overlapHa).toBe(0);
    expect(s.distanceM).toBeCloseTo(100, 0);
    expect(s.activeSeconds).toBe(50);
  });

  it('counts no overlap on a bend in a single pass', () => {
    const corner = [...bout(0, 0, 50, 0), ...Array.from({ length: 25 }, (_, i) => at(2 * (i + 1), 50, 26 + i))];
    const s = replay([corner], 6)!.stats();
    expect(s.overlapHa).toBe(0);
  });

  it('bouts set at the working width meet without overlap; set closer, they overlap', () => {
    const width = 10;
    const exact = replay([bout(0, 0, 100, 0), bout(10, 100, 0, 100)], width)!.stats();
    expect(exact.coveredHa).toBeCloseTo(0.2, 2);
    expect(exact.overlapHa).toBeLessThan(0.001);

    const tight = replay([bout(0, 0, 100, 0), bout(8, 100, 0, 100)], width)!.stats();
    // 2 m of the 10 m strip twice over: 0.02 ha.
    expect(tight.overlapHa).toBeGreaterThan(0.018);
    expect(tight.overlapHa).toBeLessThan(0.022);
    expect(tight.coveredHa).toBeCloseTo(0.18, 2);
    expect(tight.appliedHa).toBeCloseTo(0.2, 2);
  });

  it('paints nothing across a pause, and times only the work', () => {
    const track: Track = [bout(0, 0, 40, 0), bout(0, 60, 100, 500)];
    const s = replay(track, 4)!.stats();
    expect(s.coveredHa).toBeCloseTo((80 * 4) / 10000, 3);
    expect(s.distanceM).toBeCloseTo(80, 0);
    expect(s.activeSeconds).toBe(40);
  });

  it('counts a second go over the same strip after a refill as overlap', () => {
    const s = replay([bout(0, 0, 50, 0), bout(0, 0, 50, 300)], 6)!.stats();
    expect(s.overlapHa).toBeCloseTo(s.coveredHa, 3);
  });

  it('marks tiles dirty as they change and draws them', () => {
    const g = new CoverageGrid(6, [LNG0, LAT0]);
    g.startSection();
    g.addPoint(at(0, 0, 0));
    g.addPoint(at(0, 10, 5));
    const dirty = g.takeDirty();
    expect(dirty.length).toBeGreaterThan(0);
    expect(g.takeDirty()).toEqual([]);
    const px = new Uint8ClampedArray(TILE * TILE * 4);
    tilePixels(dirty[0], px);
    expect(px.some((v) => v > 0)).toBe(true);
  });
});

describe('cell size', () => {
  it('scales with the width within bounds', () => {
    expect(cellSizeFor(1.5)).toBe(0.2);
    expect(cellSizeFor(8)).toBe(0.5);
    expect(cellSizeFor(24)).toBe(1);
  });
});

describe('storing a track', () => {
  it('drops points on a straight line and keeps the corners', () => {
    const corner = [...bout(0, 0, 50, 0), ...Array.from({ length: 25 }, (_, i) => at(2 * (i + 1), 50, 26 + i))];
    const [s] = simplifyTrack([corner]);
    expect(s.length).toBe(3);
    expect(s[1][1]).toBeCloseTo(corner[25][1], 6);
  });

  it('gives the same coverage before and after simplifying', () => {
    const track: Track = [bout(0, 0, 100, 0), bout(9, 100, 0, 100)];
    const a = replay(track, 10)!.stats();
    const b = replay(simplifyTrack(track), 10)!.stats();
    expect(b.coveredHa).toBeCloseTo(a.coveredHa, 3);
    expect(b.overlapHa).toBeCloseTo(a.overlapHa, 3);
  });

  it('reads back only a real track', () => {
    expect(parseTrack([[at(0, 0, 0), at(0, 5, 2)]])).not.toBeNull();
    expect(parseTrack([])).toBeNull();
    expect(parseTrack([[at(0, 0, 0)]])).toBeNull(); // no movement
    expect(parseTrack([[[1, 2, 3]]])).toBeNull();
    expect(parseTrack([[at(0, 0, 5), at(0, 5, 2)]])).toBeNull(); // time running backwards
    expect(parseTrack([[[200, 51, 0, 1], [200, 51, 1, 1]]])).toBeNull();
    expect(parseTrack('nope')).toBeNull();
  });
});
