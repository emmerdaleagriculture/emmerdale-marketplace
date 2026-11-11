import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { isNoise } from './noise';

const ev = (type: string, value: string, frames: { function?: string; filename?: string }[] = []) =>
  ({ type: undefined, exception: { values: [{ type, value, stacktrace: { frames } }] } }) as unknown as ErrorEvent;

describe('isNoise', () => {
  it('drops Meta in-app browser errors', () => {
    expect(isNoise(ev('TypeError', "undefined is not an object (evaluating 'window._META.IABInnerFrame')"))).toBe(true);
    expect(isNoise(ev('TypeError', "undefined is not an object (evaluating 'window.webkit.messageHandlers')", [{ function: 'sendDataToNative', filename: 'https://www.emmerdaleagriculture.com/paddock-care' }]))).toBe(true);
    expect(isNoise(ev('InvalidAccessError', 'The object does not support the operation or argument.', [{ function: 'dispatchToBridge', filename: 'https://www.emmerdaleagriculture.com/signup' }]))).toBe(true);
  });

  it('keeps the same message when it passes through our bundle', () => {
    expect(isNoise(ev('TypeError', "undefined is not an object (evaluating 'window.webkit.messageHandlers')", [{ function: 'x', filename: 'https://www.emmerdaleagriculture.com/_next/static/chunks/1.js' }]))).toBe(false);
  });

  it('drops stale server actions after a deploy', () => {
    expect(isNoise(ev('Error', 'Server Action "605067ed" was not found on the server. Read more: …'))).toBe(true);
  });

  it('keeps network failures and ordinary errors', () => {
    expect(isNoise(ev('TypeError', 'Load failed', [{ function: 'fetchServerAction', filename: 'https://www.emmerdaleagriculture.com/_next/static/chunks/a.js' }]))).toBe(false);
    expect(isNoise(ev('TypeError', 'Load failed'))).toBe(false);
    expect(isNoise(ev('Error', '"App.then()" is not implemented on ios'))).toBe(false);
  });
});
