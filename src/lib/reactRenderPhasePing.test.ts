import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The loader in webpack/reactRenderPhasePing.cjs corrects one line of the
 * React that Next bundles (a dropped ping that left clicks doing nothing,
 * 2026-11-26). It is found by its text, so a Next upgrade can move it. These
 * run it over the copies actually installed: if this file fails after an
 * upgrade, read the comment at the top of the loader before touching either.
 */
const require = createRequire(import.meta.url);
const { patchReactDomClient } = require('../../webpack/reactRenderPhasePing.cjs') as {
  patchReactDomClient: (source: string, resourcePath: string) => string;
};

const nextRoot = path.dirname(require.resolve('next/package.json'));
const bundled = (file: string) => path.join(nextRoot, 'dist/compiled/react-dom/cjs', file);

describe('reactRenderPhasePing loader', () => {
  it.each(['react-dom-client.production.js', 'react-dom-client.development.js', 'react-dom-profiling.profiling.js'])(
    'records the dropped ping in the bundled %s',
    (file) => {
      const resourcePath = bundled(file);
      const source = readFileSync(resourcePath, 'utf8');
      const patched = patchReactDomClient(source, resourcePath);

      // One small change, inside pingSuspendedRoot, and it is the recording branch.
      expect(patched).not.toBe(source);
      expect(patched.length - source.length).toBeLessThan(120);
      const body = patched.slice(patched.indexOf('function pingSuspendedRoot('));
      expect(body.slice(0, 2500)).toMatch(
        /\? prepareFreshStack\(root, 0\) : \(workInProgressRootPingedLanes \|= pingedLanes\)\)\s*: \(workInProgressRootPingedLanes \|= pingedLanes\)/,
      );
      // Nothing left to fix: a second pass has no line to find.
      expect(() => patchReactDomClient(patched, resourcePath)).toThrow(/found 0/);
    },
  );

  it('stops the build on a React it does not recognise', () => {
    const production = bundled('react-dom-client.production.js');
    expect(() => patchReactDomClient('function pingSuspendedRoot() {}', production)).toThrow(/Next upgrade/);
    expect(() => patchReactDomClient('no such function here', production)).toThrow(/exactly one pingSuspendedRoot/);
    expect(() => patchReactDomClient('', '/somewhere/else.js')).toThrow(/no pattern/);
  });

  it('only ever rewrites pingSuspendedRoot', () => {
    // The same expression in some other function is not the line to change.
    const elsewhere =
      'function other() {\n  x\n      ? 0 === (executionContext & 2) && prepareFreshStack(root, 0)\n' +
      '      : (workInProgressRootPingedLanes |= pingedLanes);\n}\n' +
      `${' '.repeat(3000)}\nfunction pingSuspendedRoot(root, wakeable, pingedLanes) {\n  ensureRootIsScheduled(root);\n}\n`;
    expect(() => patchReactDomClient(elsewhere, bundled('react-dom-client.production.js'))).toThrow(/found 0/);
  });

  // The loader is a webpack loader. Turbopack does not run it and gives no
  // error, so the fix would vanish without a word. These two fail first.
  it('is still being built by webpack', () => {
    const { scripts } = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(scripts.build, 'a Turbopack build skips webpack/reactRenderPhasePing.cjs: see the top of that file').not.toMatch(
      /--turbo/,
    );
  });

  it('is on the Next major it was written for', () => {
    const { version } = JSON.parse(readFileSync(path.join(nextRoot, 'package.json'), 'utf8')) as { version: string };
    expect(
      version,
      'new Next major: check which bundler `next build` uses and whether its React still drops the ping ' +
        '(webpack/reactRenderPhasePing.cjs), then run scripts/deadClickProbe.mjs',
    ).toMatch(/^15\./);
  });
});
