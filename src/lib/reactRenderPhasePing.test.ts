import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The loader in webpack/reactRenderPhasePing.cjs corrects one line of the
 * React that Next bundles (a dropped ping that left clicks doing nothing,
 * 2026-11-26). It is found by its text, so a Next upgrade can move it. These
 * run it over the copy actually installed: if this file fails after an
 * upgrade, read the comment at the top of the loader before touching either.
 */
const require = createRequire(import.meta.url);
const { patchReactDomClient } = require('../../webpack/reactRenderPhasePing.cjs') as {
  patchReactDomClient: (source: string, resourcePath: string) => string;
};

const bundled = (file: string) =>
  path.join(path.dirname(require.resolve('next/package.json')), 'dist/compiled/react-dom/cjs', file);

describe('reactRenderPhasePing loader', () => {
  it.each(['react-dom-client.production.js', 'react-dom-client.development.js'])(
    'records the dropped ping in the bundled %s',
    (file) => {
      const resourcePath = bundled(file);
      const source = readFileSync(resourcePath, 'utf8');
      const patched = patchReactDomClient(source, resourcePath);

      // One small change, and it is the recording branch.
      expect(patched).not.toBe(source);
      expect(patched.length - source.length).toBeLessThan(120);
      expect(patched).toMatch(
        /\? prepareFreshStack\(root, 0\) : \(workInProgressRootPingedLanes \|= pingedLanes\)\)\s*: \(workInProgressRootPingedLanes \|= pingedLanes\)/,
      );
      // Nothing left to fix: a second pass has no line to find.
      expect(() => patchReactDomClient(patched, resourcePath)).toThrow(/found 0/);
    },
  );

  it('stops the build on a React it does not recognise', () => {
    expect(() => patchReactDomClient('function pingSuspendedRoot() {}', bundled('react-dom-client.production.js'))).toThrow(
      /Next upgrade/,
    );
    expect(() => patchReactDomClient('', '/somewhere/else.js')).toThrow(/no pattern/);
  });
});
