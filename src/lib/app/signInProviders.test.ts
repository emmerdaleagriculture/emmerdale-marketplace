import { afterEach, describe, expect, it } from 'vitest';
import { signInProvidersConfigured } from './signInProviders';

const KEYS = ['NEXT_PUBLIC_APPLE_SERVICES_ID', 'NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('signInProvidersConfigured', () => {
  it('offers nothing until a client ID is set', () => {
    for (const k of KEYS) delete process.env[k];
    expect(signInProvidersConfigured()).toEqual([]);
    process.env.NEXT_PUBLIC_APPLE_SERVICES_ID = '   ';
    expect(signInProvidersConfigured()).toEqual([]);
  });

  it('offers each provider on its own ID', () => {
    for (const k of KEYS) delete process.env[k];
    process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID = '123.apps.googleusercontent.com';
    expect(signInProvidersConfigured()).toEqual(['google']);
    process.env.NEXT_PUBLIC_APPLE_SERVICES_ID = 'com.emmerdaleagriculture.web';
    expect(signInProvidersConfigured()).toEqual(['apple', 'google']);
  });
});
