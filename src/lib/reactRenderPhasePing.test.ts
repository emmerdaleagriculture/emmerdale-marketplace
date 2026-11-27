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
const bundled = (file: string, channel = 'react-dom') => path.join(nextRoot, 'dist/compiled', channel, 'cjs', file);

// Every copy the rule in next.config.mjs sends to the loader: the three
// builds, in the channel Next uses by default and in the experimental one it
// switches to when a flag such as `ppr` is turned on.
const COPIES = ['react-dom', 'react-dom-experimental'].flatMap((channel) =>
  ['react-dom-client.production.js', 'react-dom-client.development.js', 'react-dom-profiling.profiling.js'].map(
    (file) => [channel, file] as const,
  ),
);

describe('reactRenderPhasePing loader', () => {
  it.each(COPIES)('records the dropped ping in the bundled %s/cjs/%s', (channel, file) => {
    const resourcePath = bundled(file, channel);
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
  });

  it('stops the build on a React it does not recognise', () => {
    const production = bundled('react-dom-client.production.js');
    expect(() => patchReactDomClient('function pingSuspendedRoot() {}', production)).toThrow(/Next upgrade/);
    expect(() => patchReactDomClient('no such function here', production)).toThrow(/exactly one pingSuspendedRoot/);
    expect(() => patchReactDomClient('', '/somewhere/else.js')).toThrow(/no pattern/);
  });

  it('only ever rewrites pingSuspendedRoot', () => {
    // The same expression in another function, before it or straight after
    // it, is not the line to change: a React whose pingSuspendedRoot already
    // records the ping has to stop the build, not be patched somewhere else.
    const lookalike =
      '  x\n      ? 0 === (executionContext & 2) && prepareFreshStack(root, 0)\n' +
      '      : (workInProgressRootPingedLanes |= pingedLanes);\n';
    const alreadyFixed = 'function pingSuspendedRoot(root, wakeable, pingedLanes) {\n  ensureRootIsScheduled(root);\n}\n';
    const production = bundled('react-dom-client.production.js');
    expect(() => patchReactDomClient(`function before() {\n${lookalike}}\n${alreadyFixed}`, production)).toThrow(/found 0/);
    expect(() => patchReactDomClient(`${alreadyFixed}function after() {\n${lookalike}}\n`, production)).toThrow(/found 0/);
    // And the same line inside it is found, so the two above are not passing by accident.
    const dropping = `function pingSuspendedRoot(root, wakeable, pingedLanes) {\n${lookalike}}\n`;
    expect(patchReactDomClient(dropping, production)).toContain('? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes))');
  });

  // The loader is a webpack loader. Turbopack does not run it and gives no
  // error. next.config.mjs refuses a Turbopack build for that reason; these
  // two say so sooner, in the test run, before anything is built.
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
