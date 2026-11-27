'use strict';

/**
 * Webpack loader: one line of React, corrected in the copy Next bundles.
 *
 * WHAT WENT WRONG (2026-11-26). After the section loading screens went in
 * (loading.tsx, PR #420), clicks inside a signed-in section sometimes did
 * nothing: the server sent the whole new page, the browser never showed it,
 * no error, and a second click worked. Measured on a production build,
 * /admin/submissions to a job page: 37 dead clicks in 120.
 *
 * WHY. A loading.tsx puts the section's pages inside a Suspense boundary.
 * Moving between two pages of the same section happens inside a boundary
 * that is already showing content, so React holds the old page and waits to
 * be told ("pinged") that the new page's data has arrived. That data is a
 * stream, and reading one part of it can complete another part on the spot,
 * so the ping can fire while React is in the middle of rendering.
 * The React bundled by Next 15.5.29 (19.2.0-canary-0bdb9206-20250818)
 * handles that case by doing nothing:
 *
 *     if ((executionContext & RenderContext) === NoContext) {
 *       prepareFreshStack(root, NoLanes);
 *     } else {
 *       // TODO: ...
 *     }
 *
 * The render then finishes, marks itself "waiting for data", and the one
 * ping that would have woken it has already been thrown away. It waits for
 * ever. With the section's loading.tsx removed there is no boundary around
 * the page and it did not happen at all (0 in 120), which is why the fault
 * arrived with the loading screens: every dead click in the test had a ping
 * thrown away this way, and none did once it was recorded.
 *
 * THE FIX is React's own: pull request 36134 in facebook/react, "Fix
 * useDeferredValue getting stuck", merged to main on 2026-03-24, seven
 * months after the copy bundled here was cut. It makes the empty `else`
 * record the ping, so the finished render is not marked as waiting and runs
 * again:
 *
 *     } else {
 *       // ... In the meantime, record the pinged lanes so markRootSuspended
 *       // won't mark them as suspended, allowing a retry.
 *       workInProgressRootPingedLanes = mergeLanes(
 *         workInProgressRootPingedLanes,
 *         pingedLanes,
 *       );
 *     }
 *
 * This loader makes exactly that change to the bundled copy as it is
 * compiled. Same build, same test, with it: 0 dead clicks in 120.
 *
 * WHEN NEXT IS UPGRADED the bundled React changes with it. If the line this
 * looks for is gone the build stops here rather than quietly shipping
 * without the fix. next.config.mjs stops it if no bundled React reached this
 * loader at all, or if the build is Turbopack's, which runs no webpack
 * loaders and says nothing about it. Then: read pingSuspendedRoot in
 * node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js.
 * If the render-phase branch now records the ping (any React cut after March
 * 2026 should), delete four things: this file, its rule in next.config.mjs,
 * the ReactRenderPhasePing plugin under that rule (left behind, it fails
 * every build), and src/lib/reactRenderPhasePing.test.ts. The Turbopack
 * check at the top of next.config.mjs can go with them. If the branch is
 * still empty, update the patterns below. Either way, run
 * scripts/deadClickProbe.mjs against a production build before believing it.
 */

/** The same line as it is written in each build of react-dom-client. */
const BUILDS = [
  {
    // What `next build` ships, and `next build --profile`.
    file: /react-dom-(?:client\.production|profiling\.profiling)\.js$/,
    dropped:
      /0 === \(executionContext & 2\) &&\s*prepareFreshStack\(root, 0\)(?=\s*: \(workInProgressRootPingedLanes \|= pingedLanes\))/g,
    recorded:
      '(0 === (executionContext & 2) ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes))',
  },
  {
    // What `next dev` runs.
    file: /react-dom-client\.development\.js$/,
    dropped:
      /\(executionContext & RenderContext\) === NoContext &&\s*prepareFreshStack\(root, 0\)(?=\s*: \(workInProgressRootPingedLanes \|= pingedLanes\))/g,
    recorded:
      '((executionContext & RenderContext) === NoContext ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes))',
  },
];

const FUNCTION = 'function pingSuspendedRoot(';
/** Over twice its longest today (about 2,100 characters, in the experimental development build). */
const FUNCTION_MAX = 5000;

function changed(resourcePath, what) {
  return new Error(
    `reactRenderPhasePing: ${what} in ${resourcePath}. The React bundled with Next has changed ` +
      `(a Next upgrade?). If pingSuspendedRoot now records a ping that arrives during the render phase, delete ` +
      `webpack/reactRenderPhasePing.cjs, its rule and the ReactRenderPhasePing plugin in next.config.mjs, and its ` +
      `test; if not, update the patterns. See the comment at the top of the loader.`,
  );
}

/**
 * Where pingSuspendedRoot starts and ends in `source`. These files are
 * pretty-printed, so the function ends at the first line that is a closing
 * brace at the function's own indentation.
 */
function functionSpan(source, resourcePath) {
  const start = source.indexOf(FUNCTION);
  if (start === -1 || source.indexOf(FUNCTION, start + 1) !== -1) {
    throw changed(resourcePath, 'expected exactly one pingSuspendedRoot');
  }
  const indent = source.slice(source.lastIndexOf('\n', start) + 1, start);
  const close = /^[ \t]*$/.test(indent) ? source.indexOf(`\n${indent}}`, start) : -1;
  if (close === -1 || close - start > FUNCTION_MAX) {
    throw changed(resourcePath, 'could not tell where pingSuspendedRoot ends');
  }
  return [start, close + indent.length + 2];
}

/**
 * Returns `source` with the dropped ping recorded. Throws if the file is not
 * one this was written for, or the line is not there exactly once. Only
 * pingSuspendedRoot itself is searched, so the same text turning up anywhere
 * else in React is never rewritten by mistake.
 */
function patchReactDomClient(source, resourcePath) {
  const build = BUILDS.find((b) => b.file.test(resourcePath));
  if (!build) {
    throw new Error(`reactRenderPhasePing: no pattern for ${resourcePath}. See webpack/reactRenderPhasePing.cjs.`);
  }
  const [start, end] = functionSpan(source, resourcePath);
  const body = source.slice(start, end);
  const found = body.match(build.dropped);
  if (!found || found.length !== 1) {
    throw changed(
      resourcePath,
      `expected pingSuspendedRoot to drop a render-phase ping exactly once, found ${found ? found.length : 0}`,
    );
  }
  return source.slice(0, start) + body.replace(build.dropped, build.recorded) + source.slice(end);
}

module.exports = function reactRenderPhasePingLoader(source) {
  return patchReactDomClient(source, this.resourcePath);
};
module.exports.patchReactDomClient = patchReactDomClient;
