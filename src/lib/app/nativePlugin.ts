/**
 * Load a Capacitor plugin across an async boundary without losing it.
 *
 * A Capacitor plugin is a Proxy that answers every property name with a
 * method, `then` included. Resolve a promise with one, by returning it from
 * an async function or from a `.then` callback, and the promise machinery
 * takes it for a thenable and calls `plugin.then(resolve, reject)`. The
 * runtime has no native method of that name, so the call rejects with
 * `"App.then()" is not implemented on ios`, which nobody handles (that is
 * the Sentry issue), and because neither resolve nor reject is ever
 * called, the awaiting caller hangs for good. The try/catch around it
 * never runs and the feature behind it silently never starts. App links
 * died this way on both platforms in the first test builds (2026-10-21).
 *
 * So the proxy travels inside a plain object, which the promise machinery
 * leaves alone. `load` brings in the module (a module namespace is safe to
 * resolve with); `pick` takes the plugin out of it synchronously, here,
 * after the await, so the proxy is never itself a promise's value.
 */
export async function nativePlugin<M, P>(
  load: () => Promise<M>,
  pick: (mod: M) => P,
): Promise<{ plugin: P }> {
  const mod = await load();
  return { plugin: pick(mod) };
}
