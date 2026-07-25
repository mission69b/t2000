// tsup onSuccess: (1) single shebang on the bundle; (2) ship the
// bytecode-template wasm next to it — the bundled SDK lazy-loads it relative
// to __dirname (= dist/), so without this `t2 agent tokenize` dies ENOENT.
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const f = 'dist/index.js';
const code = readFileSync(f, 'utf8').replace(/^#!.*\n/gm, '');
writeFileSync(f, `#!/usr/bin/env node\n${code}`);

const store = resolve('../../node_modules/.pnpm');
const dir = readdirSync(store).find((d) => d.startsWith('@mysten+move-bytecode-template@'));
if (!dir) throw new Error('move-bytecode-template not in pnpm store');
copyFileSync(
  join(store, dir, 'node_modules/@mysten/move-bytecode-template/nodejs/move_bytecode_template_bg.wasm'),
  'dist/move_bytecode_template_bg.wasm',
);
console.log('postbuild: shebang + wasm shipped');
