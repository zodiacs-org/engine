import { build } from 'esbuild';
import { readdir } from 'node:fs/promises';

// Bundle relative parent sources into local output only. Never build parent dist/.
await build({
  entryPoints: ['src/index.ts', 'src/http-worker.ts', ...(await readdir('test')).filter(name => name.endsWith('.test.ts')).map(name => `test/${name}`)],
  outbase: '.', outdir: 'build', bundle: true, platform: 'node', format: 'esm',
  target: 'node22', nodePaths: ['node_modules'],
  // astronomy-engine's CommonJS distribution needs the native Node loader.
  banner: { js: 'import { createRequire as eventsCreateRequire } from "node:module"; const require = eventsCreateRequire(import.meta.url);' }
});
