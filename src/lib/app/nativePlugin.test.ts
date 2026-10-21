import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nativePlugin } from './nativePlugin';

/**
 * The real @capacitor/core runtime against a faked native bridge: enough
 * for registerPlugin to build the proxy exactly as it does on a phone.
 */
const g = globalThis as unknown as Record<string, unknown>;

function settlesWithin<T>(p: Promise<T>, ms: number): Promise<T | 'hung'> {
  return Promise.race([p, new Promise<'hung'>((r) => setTimeout(() => r('hung'), ms))]);
}

describe('nativePlugin', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);

  beforeEach(() => {
    g['window'] = globalThis;
    g['Capacitor'] = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      platform: 'ios',
      PluginHeaders: [{ name: 'App', methods: [{ name: 'getLaunchUrl', rtype: 'promise' }] }],
      nativePromise: () => Promise.resolve({ url: null }),
      nativeCallback: () => 'cb',
    };
    process.on('unhandledRejection', onUnhandled);
  });
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    delete g['window'];
    delete g['Capacitor'];
  });

  it('hands the proxy over inside a box, so the await settles', async () => {
    const got = await settlesWithin(
      nativePlugin(
        () => import('@capacitor/core'),
        (m) => m.registerPlugin<{ addListener: unknown; getLaunchUrl: unknown }>('App', {}),
      ),
      500,
    );
    expect(got).not.toBe('hung');
    if (got === 'hung') return;
    expect(typeof got.plugin.addListener).toBe('function');
    expect(typeof got.plugin.getLaunchUrl).toBe('function');
  });

  it('documents the trap: a bare proxy as a promise value never settles', async () => {
    const { registerPlugin } = await import('@capacitor/core');
    // The shape links.ts and push.ts had before 2026-10-21.
    const bare = async () => registerPlugin('App', {});
    expect(await settlesWithin(bare(), 200)).toBe('hung');
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled.map(String).join('\n')).toMatch(/"App\.then\(\)" is not implemented/);
  });
});
