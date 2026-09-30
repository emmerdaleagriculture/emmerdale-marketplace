import { describe, expect, it } from 'vitest';
import { sizeLabel } from './openJobs';

describe('sizeLabel', () => {
  it('prints acres, rounded to suit the size', () => {
    expect(sizeLabel(7.83, 'acres')).toBe('7.8 acres');
    expect(sizeLabel(61.27, 'acres')).toBe('61 acres');
    expect(sizeLabel(1, 'acres')).toBe('1 acre');
    expect(sizeLabel(0.33, 'acres')).toBe('under an acre');
  });

  it('converts hectares', () => {
    expect(sizeLabel(2, 'hectares')).toBe('4.9 acres');
  });

  it('leaves out figures that would mislead', () => {
    expect(sizeLabel(30, 'linear_m')).toBeNull();
    expect(sizeLabel(1.82, null)).toBeNull();
    expect(sizeLabel(0, 'acres')).toBeNull();
    expect(sizeLabel(0.02, 'acres')).toBeNull();
    expect(sizeLabel(null, 'acres')).toBeNull();
  });
});
