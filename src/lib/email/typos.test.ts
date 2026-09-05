import { describe, expect, it } from 'vitest';
import { suggestKnownProviderTypo, suggestEmailFix } from './typos';

describe('suggestKnownProviderTypo', () => {
  it('leaves a correct provider address alone', () => {
    for (const e of ['tom@gmail.com', 'tom@hotmail.co.uk', 'tom@btinternet.com']) {
      expect(suggestKnownProviderTypo(e)).toBeNull();
    }
  });

  it('catches transpositions, the commonest slip', () => {
    expect(suggestKnownProviderTypo('tom@gmial.com')).toBe('tom@gmail.com');
    expect(suggestKnownProviderTypo('tom@hotmial.co.uk')).toBe('tom@hotmail.co.uk');
  });

  it('catches dropped and doubled characters', () => {
    expect(suggestKnownProviderTypo('tom@gmal.com')).toBe('tom@gmail.com');
    expect(suggestKnownProviderTypo('tom@outlok.com')).toBe('tom@outlook.com');
  });

  it('keeps the local part exactly as typed, @ included', () => {
    expect(suggestKnownProviderTypo('a.b+tag@gmial.com')).toBe('a.b+tag@gmail.com');
  });

  it('does not touch a business domain that resembles nothing', () => {
    expect(suggestKnownProviderTypo('tom@emmerdaleagriculture.com')).toBeNull();
    expect(suggestKnownProviderTypo('nav@ncramco.com')).toBeNull();
  });

  it('will not turn one real provider into another', () => {
    // live.com and live.co.uk both exist; neither should suggest the other.
    expect(suggestKnownProviderTypo('tom@live.com')).toBeNull();
    expect(suggestKnownProviderTypo('tom@me.com')).toBeNull();
  });

  it('ignores anything that is not an address', () => {
    expect(suggestKnownProviderTypo('')).toBeNull();
    expect(suggestKnownProviderTypo('gmail.com')).toBeNull();
    expect(suggestKnownProviderTypo('tom@')).toBeNull();
  });
});

describe('suggestEmailFix', () => {
  it('fixes the TLD that started all this', () => {
    expect(suggestEmailFix('tom@lumenira.con')).toBe('tom@lumenira.com');
  });

  it('prefers .com over .co when both are one edit away', () => {
    expect(suggestEmailFix('tom@outlook.cmo')).toBe('tom@outlook.com');
  });

  it('repairs a mistyped .co.uk', () => {
    expect(suggestEmailFix('tom@yahoo.co.ku')).toBe('tom@yahoo.co.uk');
  });

  it('offers nothing for an ending it cannot place', () => {
    expect(suggestEmailFix('tom@somewhere.qqqqzz')).toBeNull();
  });

  it('accepts a real ending without comment', () => {
    expect(suggestEmailFix('tom@farm.farm')).toBeNull();
    expect(suggestEmailFix('tom@thing.org.uk')).toBeNull();
  });
});
