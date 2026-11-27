import { describe, expect, it } from 'vitest';
import { fig, kmhFrom100m, knapsack, litresPerHa, nozzleOutput, tankMix, toHa } from './sprayMaths';

describe('tank mix', () => {
  it('works out product, fills and the last part tank', () => {
    // 10 ha at 2 L/ha in 200 L/ha of water with a 600 L tank.
    const m = tankMix(10, 2, 200, 600)!;
    expect(m.product).toBe(20);
    expect(m.spray).toBe(2000);
    expect(m.fills).toBe(4);
    expect(m.haPerTank).toBe(3);
    expect(m.productPerFullTank).toBe(6);
    expect(m.lastSpray).toBeCloseTo(200);
    expect(m.lastProduct).toBeCloseTo(2);
    // The fills add back up to the job.
    expect(3 * m.productPerFullTank + m.lastProduct).toBeCloseTo(m.product);
  });
  it('counts an exact number of tanks as full tanks', () => {
    const m = tankMix(6, 2, 200, 600)!;
    expect(m.fills).toBe(2);
    expect(m.lastSpray).toBeCloseTo(600);
  });
  it('wants every figure', () => {
    expect(tankMix(0, 2, 200, 600)).toBeNull();
    expect(tankMix(1, 2, 0, 600)).toBeNull();
  });
  it('converts acres', () => {
    expect(toHa(2.4710538, 'acre')).toBeCloseTo(1);
    expect(toHa(3, 'ha')).toBe(3);
  });
});

describe('knapsack', () => {
  it('gives millilitres per fill and the ground it covers', () => {
    // 2 L/ha in 400 L/ha: a 15 L fill covers 375 m2 and takes 75 ml.
    const k = knapsack(2, 400, 15)!;
    expect(k.m2).toBeCloseTo(375);
    expect(k.productMl).toBeCloseTo(75);
  });
});

describe('calibration', () => {
  it('uses the standard formula both ways', () => {
    // 0.8 L/min at 8 km/h on 0.5 m spacing is 120 L/ha.
    expect(litresPerHa(0.8, 8, 0.5)).toBeCloseTo(120);
    expect(nozzleOutput(120, 8, 0.5)).toBeCloseTo(0.8);
  });
  it('times 100 metres', () => {
    expect(kmhFrom100m(45)).toBeCloseTo(8);
    expect(kmhFrom100m(0)).toBeNull();
  });
});

describe('fig', () => {
  it('keeps about three figures', () => {
    expect(fig(0.1234)).toBe('0.123');
    expect(fig(12.345)).toBe('12.3');
    expect(fig(1250.4)).toBe('1,250');
    expect(fig(6)).toBe('6');
  });
});
