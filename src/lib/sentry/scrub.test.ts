import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { scrubEvent } from './scrub';

describe('scrubEvent breadcrumbs', () => {
  it('redacts a quote token in navigation from/to', () => {
    const tok = 'ab'.repeat(24); // a made-up 48-hex token
    const e = scrubEvent({
      type: undefined,
      breadcrumbs: [{ category: 'navigation', data: { from: `/quote/${tok}`, to: `/quote/${tok}/pass` } }],
    } as unknown as ErrorEvent);
    expect(JSON.stringify(e.breadcrumbs)).not.toContain(tok);
    expect(e.breadcrumbs?.[0].data?.to).toBe('/quote/[redacted]/pass');
  });
});
