import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await mkdir(new URL('../generated/', import.meta.url), { recursive: true });
// Resolve the engine's pinned dependency locally. The parent checkout stays read-only.
await build({
  stdin: {
    contents: 'export { calc } from "../../src/calc.ts"; export { VOID_BODIES, VOID_OF_COURSE_CONVENTION } from "../../src/techniques/void-of-course.ts"; export { planetaryHours, planetaryHourAt } from "../../src/sky/hours.ts";',
    resolveDir: fileURLToPath(new URL('../src/', import.meta.url)),
    sourcefile: 'electional-engine-bridge.mjs', loader: 'js',
  },
  outfile: fileURLToPath(new URL('../generated/engine.mjs', import.meta.url)),
  alias: { 'astronomy-engine': fileURLToPath(new URL('../node_modules/astronomy-engine/esm/astronomy.js', import.meta.url)) },
  bundle: true, format: 'esm', platform: 'node', target: 'node22',
  splitting: false, legalComments: 'inline',
});
console.log('Built read-only engine source bridge inside electional/generated/.');
