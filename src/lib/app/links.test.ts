import { afterEach, describe, expect, it } from 'vitest';
import { launchAlreadyFollowed } from './links';

/**
 * getLaunchUrl keeps answering with the link the app was opened with, and
 * following it reloads the page, which asks again. A text's /t/<code> link
 * redirects elsewhere, so without this record the app reloaded forever.
 */
const g = globalThis as unknown as Record<string, unknown>;

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as Storage;
}

afterEach(() => {
  delete g.window;
});

describe('launchAlreadyFollowed', () => {
  it('follows a launch link once per app session', () => {
    g.window = { sessionStorage: fakeStorage() };
    const link = 'https://www.emmerdaleagriculture.com/t/Ab3dE6g';
    expect(launchAlreadyFollowed(link)).toBe(false);
    // The reload after following it: same launch URL, must not go again.
    expect(launchAlreadyFollowed(link)).toBe(true);
    expect(launchAlreadyFollowed(link)).toBe(true);
  });

  it('a different launch link still goes', () => {
    g.window = { sessionStorage: fakeStorage() };
    expect(launchAlreadyFollowed('https://www.emmerdaleagriculture.com/t/AAAAAAA')).toBe(false);
    expect(launchAlreadyFollowed('https://www.emmerdaleagriculture.com/t/BBBBBBB')).toBe(false);
  });

  it('without storage it refuses rather than risk a loop', () => {
    g.window = {
      get sessionStorage(): Storage {
        throw new Error('SecurityError');
      },
    };
    expect(launchAlreadyFollowed('https://www.emmerdaleagriculture.com/t/Ab3dE6g')).toBe(true);
  });
});
