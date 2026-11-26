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
 * THE FIX is React's own. On React's main branch the empty `else` records
 * the ping, so the finished render is not marked as waiting and runs again:
 *
 *     } else {
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
 * without the fix. Then: read pingSuspendedRoot in
 * node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js.
 * If the render-phase branch now records the ping, delete this file, its rule
 * in next.config.mjs and its test. If it is still empty, update the patterns
 * below. Either way, run scripts/deadClickProbe.mjs against a production
 * build before believing it.
 */

/** The same line as it is written in each build of react-dom-client. */
const BUILDS = [
  {
    file: /react-dom-client\.production\.js$/,
    dropped:
      /0 === \(executionContext & 2\) &&\s*prepareFreshStack\(root, 0\)(?=\s*: \(workInProgressRootPingedLanes \|= pingedLanes\))/g,
    recorded:
      '(0 === (executionContext & 2) ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes))',
  },
  {
    file: /react-dom-client\.development\.js$/,
    dropped:
      /\(executionContext & RenderContext\) === NoContext &&\s*prepareFreshStack\(root, 0\)(?=\s*: \(workInProgressRootPingedLanes \|= pingedLanes\))/g,
    recorded:
      '((executionContext & RenderContext) === NoContext ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes))',
  },
];

/**
 * Returns `source` with the dropped ping recorded. Throws if the file is not
 * one this was written for, or the line is not there exactly once.
 */
function patchReactDomClient(source, resourcePath) {
  const build = BUILDS.find((b) => b.file.test(resourcePath));
  if (!build) {
    throw new Error(`reactRenderPhasePing: no pattern for ${resourcePath}. See webpack/reactRenderPhasePing.cjs.`);
  }
  const found = source.match(build.dropped);
  if (!found || found.length !== 1) {
    throw new Error(
      `reactRenderPhasePing: expected React's pingSuspendedRoot to drop a render-phase ping exactly once in ` +
        `${resourcePath}, found ${found ? found.length : 0}. The React bundled with Next has changed ` +
        `(a Next upgrade?). If it now records that ping, delete webpack/reactRenderPhasePing.cjs, its rule in ` +
        `next.config.mjs and its test; if not, update the patterns. See the comment at the top of the loader.`,
    );
  }
  return source.replace(build.dropped, build.recorded);
}

module.exports = function reactRenderPhasePingLoader(source) {
  return patchReactDomClient(source, this.resourcePath);
};
module.exports.patchReactDomClient = patchReactDomClient;
