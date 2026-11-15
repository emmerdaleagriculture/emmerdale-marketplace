import { describe, expect, it } from 'vitest';
import { stripInlineMd } from './inlineMd';

describe('stripInlineMd', () => {
  it('keeps link anchors and bold text, drops the markup', () => {
    expect(stripInlineMd('See [real prices](/notes/x) and **lime** now.')).toBe('See real prices and lime now.');
  });
  it('leaves non-relative links and plain text alone', () => {
    expect(stripInlineMd('[a](https://x.com) plain')).toBe('[a](https://x.com) plain');
  });
});
