import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  banner: {
    js: [
      `import { createRequire as __createRequire } from 'module';`,
      `import { fileURLToPath as __fileURLToPath } from 'url';`,
      `import { dirname as __pathDirname } from 'path';`,
      `const require = __createRequire(import.meta.url);`,
      `const __filename = __fileURLToPath(import.meta.url);`,
      `const __dirname = __pathDirname(__filename);`,
    ].join(' '),
  },
  onSuccess: `node -e "
    const fs = require('fs');
    const f = 'dist/index.js';
    const code = fs.readFileSync(f, 'utf8').replace(/^#!.*\\n/gm, '');
    fs.writeFileSync(f, '#!/usr/bin/env node\\n' + code);
  "`,
});
