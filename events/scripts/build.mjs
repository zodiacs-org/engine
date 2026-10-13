import { build } from 'esbuild';
import { readdir, rm } from 'node:fs/promises';

// Clear local output so renamed suites do not leave old Vitest-discoverable files.
await rm('build', { recursive: true, force: true });

// Bundle relative parent sources into local output only. Never build parent dist/.
await build({
  entryPoints: ['src/index.ts', 'src/http-worker.ts', ...(await readdir('test')).filter(name => name.endsWith('.node-test.ts')).map(name => `test/${name}`)],
  outbase: '.', outdir: 'build', bundle: true, platform: 'node', format: 'esm',
  target: 'node22', nodePaths: ['node_modules'],
  // astronomy-engine's CommonJS distribution needs the native Node loader.
  banner: { js: 'import { createRequire as eventsCreateRequire } from "node:module"; const require = eventsCreateRequire(import.meta.url);' }
});
