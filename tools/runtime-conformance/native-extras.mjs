#!/usr/bin/env node
/*
 * Run inside Node, Bun or Deno (not by the harness): prints one JSON line
 * naming the runtime that runs it, as that runtime reports itself, and the
 * five synthetic receipts of receipt-cases.mjs computed in it.
 *
 *   bun tools/runtime-conformance/native-extras.mjs
 *   deno run -A tools/runtime-conformance/native-extras.mjs
 */
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { receiptTexts } from './receipt-cases.mjs';

const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? fileURLToPath(new URL('../../dist', import.meta.url)));
const entryIndex = process.argv.indexOf('--entry');
const entry = entryIndex === -1 ? 'root' : process.argv[entryIndex + 1];
if (!['root', 'core'].includes(entry)) {
  console.error('usage: native-extras.mjs [--entry core]');
  process.exit(2);
}
const engine = await import(pathToFileURL(resolve(dist, entry === 'core' ? 'core.js' : 'index.js')).href);
const receipt = await import(pathToFileURL(resolve(dist, 'receipt.js')).href);

/** The runtime, from its own globals: Bun and Deno also define process.versions.node, so they are asked first. */
function describeRuntime() {
  const versions = globalThis.process?.versions ?? {};
  const tz = typeof versions.tz === 'string' ? versions.tz : 'not exposed';
  const icu = typeof versions.icu === 'string' ? versions.icu : 'not exposed';
  if (globalThis.Bun) {
    return { name: 'bun', version: globalThis.Bun.version, revision: globalThis.Bun.revision, engine: 'JavaScriptCore', engineVersion: versions.webkit ?? 'not exposed', intlTzdb: tz, icu };
  }
  if (globalThis.Deno) {
    return { name: 'deno', version: globalThis.Deno.version.deno, engine: 'V8', engineVersion: globalThis.Deno.version.v8, intlTzdb: tz, icu };
  }
  return { name: 'node', version: versions.node, engine: 'V8', engineVersion: versions.v8, intlTzdb: tz, icu };
}

process.stdout.write(`${JSON.stringify({
  runtime: { ...describeRuntime(), platform: globalThis.process?.platform, arch: globalThis.process?.arch },
  engineVersion: engine.ENGINE_VERSION,
  receipts: receiptTexts(engine, receipt),
})}\n`);
