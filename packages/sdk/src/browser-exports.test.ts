import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

// S.1195 — the `./browser` subpath must stay loadable from BOTH module
// systems. It shipped import-only, which made every CJS resolution
// (audric's `tsx --test` console suites, plain `require`) die with
// ERR_PACKAGE_PATH_NOT_EXPORTED — the S.1191 gap that forced consumers to
// hand-copy constants instead of importing them. tsup has always emitted
// dist/browser.cjs; the exports map just never pointed at it.

type ExportEntry = { types?: string; import?: string; require?: string };
const exportsMap = pkg.exports as Record<string, ExportEntry>;

describe('S.1195 — @t2000/sdk/browser exports parity', () => {
  it('./browser declares the same conditions as "." (types + import + require)', () => {
    const root = exportsMap['.'];
    const browser = exportsMap['./browser'];
    expect(Object.keys(browser).sort()).toEqual(Object.keys(root).sort());
    expect(browser.require).toBe('./dist/browser.cjs');
    expect(browser.import).toBe('./dist/browser.js');
  });

  it('every declared file ships (dist emitted by the build)', () => {
    // Skipped when dist/ hasn't been built in this checkout — the publish
    // pipeline always builds first, and the require-side smoke below runs
    // whenever the artifact exists.
    for (const entry of Object.values(exportsMap)) {
      for (const rel of Object.values(entry)) {
        const abs = join(__dirname, '..', rel);
        if (existsSync(join(__dirname, '..', 'dist'))) {
          expect(existsSync(abs), `${rel} missing from dist`).toBe(true);
        }
      }
    }
  });

  it('CJS require() of the built browser bundle exposes the money constants', () => {
    const cjsPath = join(__dirname, '..', 'dist', 'browser.cjs');
    if (!existsSync(cjsPath)) {
      return; // pre-build checkout — the parity pin above still guards the map
    }
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const browser = require(cjsPath) as Record<string, unknown>;
    expect(browser.MAX_JOB_USDC).toBe(100);
    expect(browser.MIN_JOB_USDC).toBe(0.01);
    expect(typeof browser.sellerLevelLabel).toBe('function');
  });
});
