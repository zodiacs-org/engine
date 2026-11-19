/*
 * Bundles page-entry.mjs for a browser page with esbuild, in memory: the
 * entry and one chunk for each tzdb shard the engine loads by dynamic import,
 * so that prepareLocalTime can still load them. Used by browser-adapter.mjs,
 * and by selftest.mjs, which runs the same bundle in Node.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));

/** The adapter's Node-only imports, which the page never calls (it does not run the adapter as a script). */
const NODE_STUB = `const absent = (name) => () => { throw new Error(name + ' is not available in a browser page'); };
export const readFileSync = absent('readFileSync');
export const realpathSync = absent('realpathSync');
export const resolve = absent('resolve');
export const createInterface = absent('createInterface');
export const fileURLToPath = absent('fileURLToPath');
export const pathToFileURL = absent('pathToFileURL');
`;

/** The page's assets by URL path: '/' (an empty page), '/page-entry.js' and its chunks. */
export async function bundlePage({ entry = 'root', warnings = [] } = {}) {
  const result = await build({
    absWorkingDir: here,
    entryPoints: { 'page-entry': resolve(here, 'page-entry.mjs') },
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    alias: { '@zodiacs/engine': resolve(here, entry === 'core' ? '../../dist/core.js' : '../../dist/index.js') },
    define: { __RUNTIME_CONFORMANCE_ENTRY__: JSON.stringify(entry) },
    outdir: resolve(here, '.bundle'),
    write: false,
    logLevel: 'silent',
    // astronomy-engine is resolved from the repository's own install, the exact version the engine pins.
    nodePaths: [resolve(here, '../../node_modules')],
    plugins: [{
      name: 'node-builtins-stub',
      setup(builder) {
        builder.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, namespace: 'node-stub' }));
        builder.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({ contents: NODE_STUB, loader: 'js' }));
      },
    }],
  });
  // esbuild warns that it drops the dist chunks' bare `import "./chunk-…"`
  // lines, because the package says it has no side effects; an application's
  // bundler does the same. The warnings are handed back for the record.
  for (const warning of result.warnings) warnings.push(warning.text);
  const assets = new Map([['/', { type: 'text/html', body: '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Runtime conformance</title>' }]]);
  for (const file of result.outputFiles) {
    assets.set(`/${file.path.slice(resolve(here, '.bundle').length + 1)}`, { type: 'text/javascript', body: Buffer.from(file.contents) });
  }
  return assets;
}
