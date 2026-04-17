import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  // Bundle ALL deps so the MCP server is a self-contained binary. Mirrors the
  // CLI pattern. Critical because @t2000/sdk pulls in @naviprotocol/lending,
  // whose published ESM dist imports SuiClient/getFullnodeUrl from
  // @mysten/sui/client — names that don't exist in @mysten/sui@2.x. The
  // monorepo patches lending via pnpm but npm/npx consumers never get the
  // patch, so we bake the (patched) sources into our published bundle.
  noExternal: [/.*/],
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
    const f = 'dist/bin.js';
    const code = fs.readFileSync(f, 'utf8').replace(/^#!.*\\n/gm, '');
    fs.writeFileSync(f, '#!/usr/bin/env node\\n' + code);
  "`,
});
