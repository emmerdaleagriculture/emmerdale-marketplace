import { describe, expect, it } from 'vitest';
import { GATE_WIDTH_VALUES, gateWidthLabel, normaliseW3w } from './access';

describe('normaliseW3w', () => {
  it('accepts and normalises valid addresses', () => {
    expect(normaliseW3w('filled.count.soap')).toBe('filled.count.soap');
    expect(normaliseW3w('///filled.count.soap')).toBe('filled.count.soap');
    expect(normaliseW3w('  Filled.Count.Soap ')).toBe('filled.count.soap');
    expect(normaliseW3w('filled. count. soap')).toBe('filled.count.soap');
  });

  it('rejects everything that is not three words', () => {
    expect(normaliseW3w('')).toBeNull();
    expect(normaliseW3w('two.words')).toBeNull();
    expect(normaliseW3w('a.b.c.d')).toBeNull();
    expect(normaliseW3w('has.dig1ts.here')).toBeNull();
    expect(normaliseW3w('SO24 9AA')).toBeNull();
    expect(normaliseW3w(null)).toBeNull();
    expect(normaliseW3w('x'.repeat(80))).toBeNull();
  });
});

describe('gate width options', () => {
  it('values match the migration check constraint', () => {
    expect(GATE_WIDTH_VALUES).toEqual(['standard', 'wide', 'narrow', 'none', 'unsure']);
  });

  it('labels resolve, unknowns do not', () => {
    expect(gateWidthLabel('standard')).toContain('12ft');
    expect(gateWidthLabel('bogus')).toBeNull();
    expect(gateWidthLabel(null)).toBeNull();
  });
});
