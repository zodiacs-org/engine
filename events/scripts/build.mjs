import { build } from 'esbuild';
import { readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Clear local output so renamed suites do not leave old Vitest-discoverable files.
await rm('build', { recursive: true, force: true });

// Bundle relative parent sources into local output only. Never build parent dist/.
await build({
  entryPoints: ['src/index.ts', 'src/http-worker.ts', ...(await readdir('test')).filter(name => name.endsWith('.node-test.ts')).map(name => `test/${name}`)],
  outbase: '.', outdir: 'build', bundle: true, platform: 'node', format: 'esm',
  target: 'node22', nodePaths: ['node_modules'],
  // Parent clock helpers and local vector calls must use the same locked copy.
  alias: { 'astronomy-engine': fileURLToPath(new URL('../node_modules/astronomy-engine', import.meta.url)) },
  // astronomy-engine's CommonJS distribution needs the native Node loader.
  banner: { js: 'import { createRequire as eventsCreateRequire } from "node:module"; const require = eventsCreateRequire(import.meta.url);' }
});
