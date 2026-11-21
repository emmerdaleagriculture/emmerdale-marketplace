import { describe, expect, it } from 'vitest';
import { COLOUR_PRESETS, DEFAULT_INVOICE_COLOUR, contrastOnWhite, invoiceColour, logoFit, normaliseHex, readableColour } from './branding';

describe('normaliseHex', () => {
  it('accepts long and short forms, with or without #', () => {
    expect(normaliseHex('#1F4D2B')).toBe('#1f4d2b');
    expect(normaliseHex('1f4d2b')).toBe('#1f4d2b');
    expect(normaliseHex('#abc')).toBe('#aabbcc');
    expect(normaliseHex(' #000000 ')).toBe('#000000');
  });
  it('refuses anything else', () => {
    for (const bad of ['', null, undefined, 'red', '#12345', '#1234567', 'url(x)', '#ggg']) expect(normaliseHex(bad)).toBeNull();
  });
});

describe('contrast', () => {
  it('white is 1:1 and black 21:1', () => {
    expect(contrastOnWhite('#ffffff')).toBeCloseTo(1, 5);
    expect(contrastOnWhite('#000000')).toBeCloseTo(21, 5);
  });
  it('every preset is readable, pale colours are not', () => {
    for (const p of COLOUR_PRESETS) expect(readableColour(p.hex), p.name).toBe(true);
    for (const pale of ['#ffff00', '#f4c430', '#cccccc', '#a8e6cf']) expect(readableColour(pale), pale).toBe(false);
  });
});

describe('invoiceColour', () => {
  it('falls back to ours when unset, malformed or unreadable', () => {
    expect(invoiceColour({})).toBe(DEFAULT_INVOICE_COLOUR);
    expect(invoiceColour({ invoice_colour: 'nonsense' })).toBe(DEFAULT_INVOICE_COLOUR);
    expect(invoiceColour({ invoice_colour: '#ffff00' })).toBe(DEFAULT_INVOICE_COLOUR);
    expect(invoiceColour({ invoice_colour: '#1D3F6E' })).toBe('#1d3f6e');
  });
});

describe('logoFit', () => {
  it('fits the stored size inside the box, never enlarging', () => {
    expect(logoFit('abc/1-800x300.png', 220, 80)).toEqual({ width: 213, height: 80 });
    expect(logoFit('abc/1-800x100.png', 220, 80)).toEqual({ width: 220, height: 28 });
    expect(logoFit('abc/1-100x40.png', 220, 80)).toEqual({ width: 100, height: 40 });
  });
  it('is null without a size in the path', () => {
    expect(logoFit('abc/1.png', 220, 80)).toBeNull();
    expect(logoFit(null, 220, 80)).toBeNull();
  });
});
