import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The trap links.ts and push.ts fell into (Sentry 155101834 / 155100963,
 * 2026-10-21), pinned against the real @capacitor/core runtime so the
 * comments in those files point at something executable.
 *
 * A Capacitor plugin is a Proxy that answers every property with a method,
 * `then` included. Resolve a promise with one and the promise machinery
 * calls plugin.then(resolve, reject): the wrapper rejects (no native method
 * of that name) and never calls either, so the await hangs for good and
 * the caller's try/catch never runs. Destructuring the plugin from the
 * module namespace, as every loader in src/lib/app now does, is safe: a
 * namespace has no `then`.
 *
 * The bridge is faked the way the iOS WebView presents it. createCapacitor
 * derives the platform from window.webkit.messageHandlers.bridge, not from
 * anything on window.Capacitor, so that is what makes this run as ios.
 */
const g = globalThis as unknown as Record<string, unknown>;
type Core = typeof import('@capacitor/core');
let core: Core;

function settlesWithin<T>(p: Promise<T>, ms: number): Promise<T | 'hung'> {
  return Promise.race([p, new Promise<'hung'>((r) => setTimeout(() => r('hung'), ms))]);
}

describe('a Capacitor plugin proxy as a promise value', () => {
  beforeAll(async () => {
    g['window'] = globalThis;
    g['webkit'] = { messageHandlers: { bridge: { postMessage() {} } } };
    g['Capacitor'] = {
      PluginHeaders: [{ name: 'App', methods: [{ name: 'getLaunchUrl', rtype: 'promise' }] }],
      nativePromise: () => Promise.resolve({ url: null }),
      nativeCallback: () => 'cb',
    };
    core = await import('@capacitor/core');
  });
  afterAll(() => {
    delete g['window'];
    delete g['webkit'];
    delete g['Capacitor'];
  });

  it('runs as ios against the faked bridge', () => {
    expect(core.Capacitor.getPlatform()).toBe('ios');
  });

  it('a namespace-destructured plugin is usable straight after the await', async () => {
    const load = async () => ({ App: core.registerPlugin<{ addListener: unknown; getLaunchUrl(): Promise<{ url: string | null }> }>('App', {}) });
    const { App } = await load();
    expect(typeof App.addListener).toBe('function');
    await expect(settlesWithin(App.getLaunchUrl(), 500)).resolves.toEqual({ url: null });
  });

  it('the then() the promise machinery would call rejects and never settles the caller', async () => {
    // Promise resolution calls proxy.then(resolve, reject) exactly like this.
    // Doing it by hand keeps the rejection catchable (resolving a promise
    // with the proxy would leak it as an unhandled rejection, which is the
    // Sentry event) and shows that neither handler is ever invoked, which is
    // why the awaiting caller hangs.
    const proxy = core.registerPlugin('App', {}) as unknown as {
      then(onOk: () => void, onErr: () => void): Promise<unknown>;
    };
    let handlerCalled = false;
    const mark = () => {
      handlerCalled = true;
    };
    await expect(proxy.then(mark, mark)).rejects.toThrow(/"App\.then\(\)" is not implemented on ios/);
    expect(handlerCalled).toBe(false);
  });
});
