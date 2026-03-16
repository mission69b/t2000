import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  onSuccess: `node -e "
    const fs = require('fs');
    const f = 'dist/index.js';
    const code = fs.readFileSync(f, 'utf8').replace(/^#!.*\\n/gm, '');
    fs.writeFileSync(f, '#!/usr/bin/env node\\n' + code);
  "`,
});
