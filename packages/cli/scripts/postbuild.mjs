// tsup onSuccess: single shebang on the bundle. (The bytecode-template wasm
// copy left with the Capital SDK builders, 2026-08-03 P1 purge.)
import { readFileSync, writeFileSync } from 'node:fs';

const f = 'dist/index.js';
const code = readFileSync(f, 'utf8').replace(/^#!.*\n/gm, '');
writeFileSync(f, `#!/usr/bin/env node\n${code}`);
console.log('postbuild: shebang');
