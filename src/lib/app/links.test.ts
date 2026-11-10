import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * getLaunchUrl keeps answering with a link for the life of the app (on iOS,
 * the last link opened at all), and following one reloads the page, which
 * asks again. A text's /t/<code> redirects elsewhere, so without a record
 * the app reloaded forever. These drive listenForAppLinks across simulated
 * page loads (a fresh module each time) against a fake App plugin.
 */
const g = globalThis as unknown as Record<string, unknown>;
const ORIGIN = 'https://www.emmerdaleagriculture.com';

type Opened = { url: string };

function fakeStorage(opts: { failSet?: boolean; failGet?: boolean } = {}): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (opts.failGet) throw new Error('SecurityError');
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.failSet) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
  } as Storage;
}

/** One app process: storage and the plugin's launch URL survive page loads. */
function appProcess(storage: Storage) {
  const state = { launchUrl: null as string | null, path: '/app', assigns: [] as string[] };
  let urlOpen: ((e: Opened) => void) | null = null;
  let replay: string | null = null;

  async function load(): Promise<void> {
    vi.resetModules();
    urlOpen = null;
    g.window = {
      sessionStorage: storage,
      location: {
        origin: ORIGIN,
        get pathname() {
          return state.path;
        },
        search: '',
        hash: '',
        assign: (u: string) => state.assigns.push(u),
      },
    };
    vi.doMock('@/lib/app/isApp', () => ({ isNativeApp: () => true }));
    vi.doMock('@capacitor/app', () => ({
      App: {
        addListener: async (_: string, cb: (e: Opened) => void) => {
          urlOpen = cb;
          // iOS hands a cold start's retained open event to the first listener.
          if (replay) {
            const r = replay;
            replay = null;
            cb({ url: r });
          }
        },
        getLaunchUrl: async () => (state.launchUrl ? { url: state.launchUrl } : null),
      },
    }));
    const { listenForAppLinks } = await import('./links');
    await listenForAppLinks();
  }

  /** The navigation lands (after /t/'s redirect) and the page loads again. */
  async function land(path: string): Promise<void> {
    state.path = path;
    await load();
  }

  return {
    state,
    load,
    land,
    coldStart(url: string, { replayOpen = false } = {}) {
      state.launchUrl = url;
      if (replayOpen) replay = url;
    },
    warmTap(url: string) {
      state.launchUrl = url; // iOS: lastURL follows every open
      urlOpen?.({ url });
    },
  };
}

afterEach(() => {
  delete g.window;
  vi.doUnmock('@/lib/app/isApp');
  vi.doUnmock('@capacitor/app');
});

describe('app links', () => {
  it('a cold start from a text link is followed once, not on every reload', async () => {
    const app = appProcess(fakeStorage());
    app.coldStart(`${ORIGIN}/t/AAAAAAA`);
    await app.load();
    expect(app.state.assigns).toEqual([`${ORIGIN}/t/AAAAAAA`]);
    await app.land('/quote/tok');
    await app.land('/quote/tok');
    expect(app.state.assigns).toHaveLength(1);
  });

  it('a cold start delivered twice (replayed open + launch URL) navigates once', async () => {
    const app = appProcess(fakeStorage());
    app.coldStart(`${ORIGIN}/t/AAAAAAA`, { replayOpen: true });
    await app.load();
    expect(app.state.assigns).toEqual([`${ORIGIN}/t/AAAAAAA`]);
  });

  it('a warm tap is followed once, not again by the launch path after the reload', async () => {
    const app = appProcess(fakeStorage());
    app.coldStart(`${ORIGIN}/t/AAAAAAA`);
    await app.load();
    await app.land('/quote/a');
    app.warmTap(`${ORIGIN}/t/BBBBBBB`);
    expect(app.state.assigns).toEqual([`${ORIGIN}/t/AAAAAAA`, `${ORIGIN}/t/BBBBBBB`]);
    await app.land('/quote/b');
    expect(app.state.assigns).toHaveLength(2);
  });

  it('tapping the same text again while the app is open still goes', async () => {
    const app = appProcess(fakeStorage());
    app.coldStart(`${ORIGIN}/t/AAAAAAA`);
    await app.load();
    await app.land('/quote/a');
    app.state.path = '/invitations';
    app.warmTap(`${ORIGIN}/t/AAAAAAA`);
    expect(app.state.assigns).toHaveLength(2);
  });

  it('a link elsewhere is left alone', async () => {
    const app = appProcess(fakeStorage());
    app.coldStart('https://example.com/x');
    await app.load();
    expect(app.state.assigns).toEqual([]);
  });

  it('storage that cannot be written: the launch link is skipped, no loop', async () => {
    const app = appProcess(fakeStorage({ failSet: true }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    app.coldStart(`${ORIGIN}/t/AAAAAAA`);
    await app.load();
    await app.land('/app');
    expect(app.state.assigns).toEqual([]);
  });

  it('storage that cannot be read: the launch link is skipped, no loop', async () => {
    const app = appProcess(fakeStorage({ failGet: true }));
    app.coldStart(`${ORIGIN}/t/AAAAAAA`);
    await app.load();
    expect(app.state.assigns).toEqual([]);
  });
});
